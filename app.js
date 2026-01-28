// Direct CSV URL Access - No authentication needed

const CONFIG = {
    csvUrl: 'https://gameviewstorage.blob.core.windows.net/csvfiles/todays_matches.csv'
};

// Store the current matches data
let currentMatches = [];

// Fetch CSV from URL
async function fetchCSV() {
    try {
        const response = await fetch(CONFIG.csvUrl, {
            method: 'GET',
            headers: {
                'Accept': 'text/csv',
                'Access-Control-Allow-Origin': '*'
            },
            mode: 'cors'
        });
        
        if (!response.ok) {
            throw new Error(`Failed to fetch CSV: ${response.statusText}`);
        }
        return await response.text();
    } catch (error) {
        console.error('Fetch error:', error);
        throw error;
    }
}

// Parse CSV data - properly handle quoted fields with commas
function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) {
        return [];
    }
    
    // Parse header line
    const headers = parseCSVLine(lines[0]);
    
    const data = [];
    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === '') continue; // Skip empty lines
        
        const values = parseCSVLine(lines[i]);
        const row = {};
        headers.forEach((header, index) => {
            row[header] = values[index] || '';
        });
        data.push(row);
    }
    
    return data;
}

// Parse a single CSV line handling quoted fields
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let insideQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];
        
        if (char === '"') {
            if (insideQuotes && nextChar === '"') {
                // Escaped quote
                current += '"';
                i++;
            } else {
                // Toggle quote state
                insideQuotes = !insideQuotes;
            }
        } else if (char === ',' && !insideQuotes) {
            // Field separator
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    
    // Add last field
    result.push(current.trim());
    
    return result;
}

// Parse time string and return Date object
function parseMatchTime(timeStr, dateStr) {
    if (!timeStr || timeStr === 'N/A') {
        return null;
    }
    
    // Trim whitespace from date and time strings
    dateStr = dateStr.trim();
    timeStr = timeStr.trim();
    
    // Handle both YYYY-MM-DD and DD/MM/YYYY formats
    let year, month, day;
    if (dateStr.includes('-')) {
        // YYYY-MM-DD format
        const dateParts = dateStr.split('-').map(p => p.trim());
        year = parseInt(dateParts[0]);
        month = parseInt(dateParts[1]) - 1;
        day = parseInt(dateParts[2]);
    } else if (dateStr.includes('/')) {
        // DD/MM/YYYY format (Australian format)
        const dateParts = dateStr.split('/').map(p => p.trim());
        day = parseInt(dateParts[0]);
        month = parseInt(dateParts[1]) - 1;
        year = parseInt(dateParts[2]);
    } else {
        return null;
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
        // Extract base court name (before the dash)
        const courtFull = match.Court || 'Unknown Court';
        
        // Extract court number (1, 2, 3, 4) from the court name
        const courtMatch = courtFull.match(/The Snakepit-(\d)/);
        const court = courtMatch ? `The Snakepit-${courtMatch[1]}` : courtFull;
        
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
            
            // Debug logging for Courts 1 and 4
            if (court === 'The Snakepit-1' || court === 'The Snakepit-4') {
                console.log(`\n${court} - Match: ${match['Team 1']} vs ${match['Team 2']} at ${match.Time}`);
                console.log(`Raw date: "${match.Date}", Raw time: "${match.Time}"`);
                console.log(`Parsed time: ${matchTime.toLocaleString('en-AU')}`);
                console.log(`Current time: ${now.toLocaleString('en-AU')}`);
                console.log(`10 min after: ${tenMinutesAfterStart.toLocaleString('en-AU')}`);
                console.log(`Time diff (mins): ${(now - matchTime) / (1000 * 60)}`);
                console.log(`Conditions: now >= match: ${now >= matchTime}, now < 10min after: ${now < tenMinutesAfterStart}, now < match: ${now < matchTime}`);
            }
            
            // Show match if current time is at or after start time AND before 10 minutes past start
            if (now >= matchTime && now < tenMinutesAfterStart) {
                nextMatch = match;
                if (court === 'The Snakepit-1' || court === 'The Snakepit-4') {
                    console.log(`-> SELECTED (currently playing)`);
                }
                break;
            }
            // If we haven't reached this match yet, show it as next
            if (now < matchTime) {
                nextMatch = match;
                if (court === 'The Snakepit-1' || court === 'The Snakepit-4') {
                    console.log(`-> SELECTED (upcoming)`);
                }
                break;
            }
            if (court === 'The Snakepit-1' || court === 'The Snakepit-4') {
                console.log(`-> SKIPPED (game ended)`);
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
        'The Snakepit-1': { name: 'COURT 1', sponsor: 'Treadright Podiatry & Biomechanics', logo: 'https://gameviewstorage.blob.core.windows.net/csvfiles/Court1.png' },
        'The Snakepit-2': { name: 'COURT 2', sponsor: 'Active', logo: 'https://gameviewstorage.blob.core.windows.net/csvfiles/Court2.png' },
        'The Snakepit-3': { name: 'COURT 3', sponsor: 'Innovatus Projects', logo: 'https://gameviewstorage.blob.core.windows.net/csvfiles/Court3.png' },
        'The Snakepit-4': { name: 'COURT 4', sponsor: 'Gateway Ford', logo: 'https://gameviewstorage.blob.core.windows.net/csvfiles/Court4.png' },
        'Beaton Park': { name: 'BEATON PARK', sponsor: '', logo: 'https://gameviewstorage.blob.core.windows.net/csvfiles/Beaton.png' }
    };
    
    // Always display all courts in order: Court 1, 2, 3, 4, Beaton Park
    const courtOrder = ['The Snakepit-1', 'The Snakepit-2', 'The Snakepit-3', 'The Snakepit-4', 'Beaton Park'];
    
    courtOrder.forEach(court => {
        const match = nextMatches[court];
        
        // Find matching court info
        let courtInfo = courtLogos[court];
        if (!courtInfo) {
            return; // Skip if court info not found
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
                    <img src="${courtInfo.logo}" alt="${courtInfo.name}" />
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
                    <img src="${courtInfo.logo}" alt="${courtInfo.name}" />
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

// Load CSV data and store it
async function fetchAndStoreMatches() {
    const errorDiv = document.getElementById('error');
    const loading = document.getElementById('loading');
    
    try {
        loading.style.display = 'block';
        errorDiv.style.display = 'none';
        
        const csvText = await fetchCSV();
        currentMatches = parseCSV(csvText);
        
        console.log('Parsed matches:', currentMatches);
        
        displayMatches(currentMatches);
        updateLastUpdateTime();
        
    } catch (error) {
        console.error('Error loading matches:', error);
        loading.style.display = 'none';
        errorDiv.style.display = 'block';
        errorDiv.textContent = `Error loading matches: ${error.message}. Please check the console for details.`;
    }
}

// Initialize the app
async function init() {
    updateCurrentTime();
    setInterval(updateCurrentTime, 1000);
    
    await fetchAndStoreMatches();
    
    // Refresh display every minute to update which match should be shown
    setInterval(() => {
        displayMatches(currentMatches);
    }, 60 * 1000);
    
    // Reload CSV data every 5 minutes
    setInterval(fetchAndStoreMatches, 5 * 60 * 1000);
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
