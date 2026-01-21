// Direct CSV URL Access - No authentication needed

const CONFIG = {
    csvUrl: 'https://gameviewstorage.blob.core.windows.net/csvfiles/todays_matches.csv'
    //csvUrl: 'https://ibasnakepit-my.sharepoint.com/:x:/g/personal/connectedadmin_snakepit_com_au/IQDmM4I0gb1gQ6k3gypjqsu6AYlZtF0VvvKRSSnZMQCSjR4?download=1'  // Replace with your OneDrive direct download link
};

// Fetch CSV from URL
async function fetchCSV() {
    const response = await fetch(CONFIG.csvUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch CSV: ${response.statusText}`);
    }
    return await response.text();
}

// Parse CSV data
function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    
    const data = [];
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        const row = {};
        headers.forEach((header, index) => {
            row[header] = values[index] || '';
        });
        data.push(row);
    }
    
    return data;
}

// Parse time string and return Date object
function parseMatchTime(timeStr, dateStr) {
    if (!timeStr || timeStr === 'N/A') {
        return null;
    }
    
    const dateParts = dateStr.split('-');
    const year = parseInt(dateParts[0]);
    const month = parseInt(dateParts[1]) - 1;
    const day = parseInt(dateParts[2]);
    
    const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (!timeMatch) {
        return null;
    }
    
    let hours = parseInt(timeMatch[1]);
    const minutes = parseInt(timeMatch[2]);
    const period = timeMatch[3];
    
    if (period) {
        if (period.toUpperCase() === 'PM' && hours !== 12) {
            hours += 12;
        } else if (period.toUpperCase() === 'AM' && hours === 12) {
            hours = 0;
        }
    }
    
    return new Date(year, month, day, hours, minutes);
}

// Get next match for each court
function getNextMatchPerCourt(matches) {
    const now = new Date();
    const courtMatches = {};
    
    matches.forEach(match => {
        const court = match.Court || 'Unknown Court';
        if (!courtMatches[court]) {
            courtMatches[court] = [];
        }
        
        const matchTime = parseMatchTime(match.Time, match.Date);
        if (matchTime) {
            match.parsedTime = matchTime;
            courtMatches[court].push(match);
        }
    });
    
    const nextMatches = {};
    
    Object.keys(courtMatches).forEach(court => {
        const courtGames = courtMatches[court].sort((a, b) => a.parsedTime - b.parsedTime);
        
        let nextMatch = null;
        
        for (const match of courtGames) {
            const matchTime = match.parsedTime;
            const tenMinutesAfterStart = new Date(matchTime.getTime() + 10 * 60 * 1000);
            
            if (now < tenMinutesAfterStart) {
                nextMatch = match;
                break;
            }
        }
        
        if (nextMatch) {
            nextMatches[court] = nextMatch;
        }
    });
    
    return nextMatches;
}

// Display matches on the page
function displayMatches(matches) {
    const container = document.getElementById('courts-container');
    const loading = document.getElementById('loading');
    const errorDiv = document.getElementById('error');
    
    loading.style.display = 'none';
    errorDiv.style.display = 'none';
    container.innerHTML = '';
    
    const nextMatches = getNextMatchPerCourt(matches);
    
    if (Object.keys(nextMatches).length === 0) {
        container.innerHTML = `
            <div class="no-matches">
                <h2>No upcoming matches</h2>
                <p>There are no more matches scheduled for today.</p>
            </div>
        `;
        return;
    }
    
    const sortedCourts = Object.keys(nextMatches).sort();
    
    sortedCourts.forEach(court => {
        const match = nextMatches[court];
        const now = new Date();
        const matchTime = match.parsedTime;
        const tenMinutesAfterStart = new Date(matchTime.getTime() + 10 * 60 * 1000);
        
        const isLive = now >= matchTime && now < tenMinutesAfterStart;
        const statusClass = isLive ? 'status-live' : 'status-upcoming';
        const statusText = isLive ? 'LIVE NOW' : 'UPCOMING';
        
        const card = document.createElement('div');
        card.className = 'court-card';
        card.innerHTML = `
            <div class="court-header">
                <div class="court-name">${escapeHtml(court)}</div>
                <div class="match-time">
                    <span class="status-indicator ${statusClass}"></span>
                    ${statusText} - ${escapeHtml(match.Time)}
                </div>
            </div>
            <div class="match-info">
                <div class="team">
                    <span class="team-label">Home:</span>
                    <span class="team-name">${escapeHtml(match['Team 1'] || 'TBA')}</span>
                </div>
                <div class="vs-divider">VS</div>
                <div class="team">
                    <span class="team-label">Away:</span>
                    <span class="team-name">${escapeHtml(match['Team 2'] || 'TBA')}</span>
                </div>
                ${match.MatchID && match.MatchID !== 'N/A' ? `
                    <div class="match-id">Match ID: ${escapeHtml(match.MatchID)}</div>
                ` : ''}
            </div>
        `;
        container.appendChild(card);
    });
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Update current time display
function updateCurrentTime() {
    const timeElement = document.getElementById('current-time');
    const now = new Date();
    timeElement.textContent = now.toLocaleString('en-AU', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });
}

// Update last update time
function updateLastUpdateTime() {
    const lastUpdateElement = document.getElementById('last-update');
    const now = new Date();
    lastUpdateElement.textContent = now.toLocaleTimeString('en-AU', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });
}

// Main function to load and display matches
async function loadMatches() {
    const errorDiv = document.getElementById('error');
    const loading = document.getElementById('loading');
    
    try {
        loading.style.display = 'block';
        errorDiv.style.display = 'none';
        
        const csvText = await fetchCSV();
        const matches = parseCSV(csvText);
        
        displayMatches(matches);
        updateLastUpdateTime();
        
    } catch (error) {
        console.error('Error loading matches:', error);
        loading.style.display = 'none';
        errorDiv.style.display = 'block';
        errorDiv.textContent = `Error loading matches: ${error.message}. Please check your CSV URL configuration.`;
    }
}

// Initialize the app
async function init() {
    updateCurrentTime();
    setInterval(updateCurrentTime, 1000);
    
    await loadMatches();
    
    setInterval(loadMatches, 2 * 60 * 1000);
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
