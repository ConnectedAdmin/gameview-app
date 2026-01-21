// Direct CSV URL Access - No authentication needed

const CONFIG = {
    csvUrl: 'https://gameviewstorage.blob.core.windows.net/csvfiles/todays_matches.csv'
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
    
    // Handle both YYYY-MM-DD and M/D/YYYY formats
    let year, month, day;
    if (dateStr.includes('-')) {
        // YYYY-MM-DD format
        const dateParts = dateStr.split('-');
        year = parseInt(dateParts[0]);
        month = parseInt(dateParts[1]) - 1;
        day = parseInt(dateParts[2]);
    } else {
        // M/D/YYYY format
        const dateParts = dateStr.split('/');
        month = parseInt(dateParts[0]) - 1;
        day = parseInt(dateParts[1]);
        year = parseInt(dateParts[2]);
    }
    
    // Parse time - handle both "PM" and "pm"
    const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?/i);
    if (!timeMatch) {
        return null;
    }
    
    let hours = parseInt(timeMatch[1]);
    const minutes = parseInt(timeMatch[2]);
    const period = timeMatch[3] ? timeMatch[3].toUpperCase() : null;
    
    if (period) {
        if (period === 'PM' && hours !== 12) {
            hours += 12;
        } else if (period === 'AM' && hours === 12) {
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
        
        nextMatches[court] = nextMatch; // Set to null if no match found
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
    
    // Define court logos mapping
    const courtLogos = {
        'The Snakepit-1': { name: 'COURT 1', sponsor: 'Treadright Podiatry & Biomechanics', logo: 'https://via.placeholder.com/120/4A90E2/FFFFFF?text=TR' },
        'The Snakepit-2': { name: 'COURT 2', sponsor: 'Active', logo: 'https://via.placeholder.com/120/E94B3C/FFFFFF?text=A' },
        'The Snakepit-3': { name: 'COURT 3', sponsor: 'Innovatus Projects', logo: 'https://via.placeholder.com/120/7ED321/FFFFFF?text=IP' },
        'The Snakepit-4': { name: 'COURT 4', sponsor: 'Gateway Ford', logo: 'https://via.placeholder.com/120/003D7A/FFFFFF?text=GF' },
        'Beaton Park': { name: 'BEATON PARK', sponsor: '', logo: 'https://via.placeholder.com/120/666666/FFFFFF?text=BP' }
    };
    
    // Sort courts in order: Court 1, 2, 3, 4, Beaton Park
    const courtOrder = ['The Snakepit-1', 'The Snakepit-2', 'The Snakepit-3', 'The Snakepit-4', 'Beaton Park'];
    const sortedCourts = Object.keys(nextMatches).sort((a, b) => {
        // Match court names that start with the keys
        const courtA = courtOrder.find(c => a.startsWith(c)) || a;
        const courtB = courtOrder.find(c => b.startsWith(c)) || b;
        const indexA = courtOrder.indexOf(courtA);
        const indexB = courtOrder.indexOf(courtB);
        
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
    });
    
    sortedCourts.forEach(court => {
        const match = nextMatches[court];
        
        // Find matching court info
        let courtInfo = { name: 'COURT', sponsor: '', logo: '' };
        for (const [key, value] of Object.entries(courtLogos)) {
            if (court.startsWith(key)) {
                courtInfo = value;
                break;
            }
        }
        
        const card = document.createElement('div');
        card.className = 'court-card';
        
        if (match) {
            // Display match information
            const now = new Date();
            const matchTime = match.parsedTime;
            const tenMinutesAfterStart = new Date(matchTime.getTime() + 10 * 60 * 1000);
            
            const isLive = now >= matchTime && now < tenMinutesAfterStart;
            const statusClass = isLive ? 'status-live' : 'status-upcoming';
            
            card.innerHTML = `
                <div class="court-logo">
                    <div class="court-logo-placeholder">${courtInfo.name.split(' ')[1] || courtInfo.name[0]}</div>
                </div>
                <div>
                    <div class="court-header">
                        <div class="court-name">${courtInfo.name}</div>
                    </div>
                    <div class="match-info">
                        <div class="team">
                            <span class="team-name">${escapeHtml(match['Team 1'] || 'TBA')}</span>
                        </div>
                        <div class="vs-divider">vs</div>
                        <div class="team">
                            <span class="team-name">${escapeHtml(match['Team 2'] || 'TBA')}</span>
                        </div>
                        <div class="match-time">
                            ${escapeHtml(match.Time)}
                        </div>
                    </div>
                </div>
            `;
        } else {
            // Display "No Games Scheduled" for this court
            card.innerHTML = `
                <div class="court-logo">
                    <div class="court-logo-placeholder">${courtInfo.name.split(' ')[1] || courtInfo.name[0]}</div>
                </div>
                <div>
                    <div class="court-header">
                        <div class="court-name">${courtInfo.name}</div>
                    </div>
                    <div class="match-info">
                        <div class="no-game-message">No Games Scheduled</div>
                    </div>
                </div>
            `;
        }
        
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
