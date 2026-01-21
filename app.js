// Microsoft Graph API Configuration
const CONFIG = {
    clientId: 'YOUR_CLIENT_ID', // Replace with your Azure App Registration Client ID
    authority: 'https://login.microsoftonline.com/common',
    redirectUri: window.location.origin,
    scopes: ['Files.Read', 'Files.Read.All']
};

// OneDrive file details
const ONEDRIVE_CONFIG = {
    // Option 1: Direct share link (easier setup)
    shareLink: 'https://ibasnakepit-my.sharepoint.com/:x:/g/personal/connectedadmin_snakepit_com_au/IQCDtVwWw0ewRqPUxj9mjtYBAUWHSNGRUHVeY8WjlSNA6EQ?download=1', // Replace with your shared CSV link
    
    // Option 2: File path (if using app authentication)
    filePath: '/OneDrive - Illawarra Basketball Association/Data/Fixture/BasketballConnect/todays_matches.csv'
};

let msalInstance = null;
let currentAccount = null;

// Initialize MSAL (Microsoft Authentication Library)
function initializeMSAL() {
    if (typeof msal === 'undefined') {
        console.warn('MSAL not loaded, using direct CSV URL method');
        return;
    }
    
    const msalConfig = {
        auth: {
            clientId: CONFIG.clientId,
            authority: CONFIG.authority,
            redirectUri: CONFIG.redirectUri
        },
        cache: {
            cacheLocation: 'localStorage',
            storeAuthStateInCookie: false
        }
    };
    
    msalInstance = new msal.PublicClientApplication(msalConfig);
}

// Get access token for Microsoft Graph API
async function getAccessToken() {
    if (!msalInstance) {
        return null;
    }
    
    const accounts = msalInstance.getAllAccounts();
    
    if (accounts.length === 0) {
        // No user signed in, try silent sign in or redirect to login
        try {
            const loginResponse = await msalInstance.loginPopup({
                scopes: CONFIG.scopes
            });
            currentAccount = loginResponse.account;
        } catch (error) {
            console.error('Login failed:', error);
            return null;
        }
    } else {
        currentAccount = accounts[0];
    }
    
    const request = {
        scopes: CONFIG.scopes,
        account: currentAccount
    };
    
    try {
        const response = await msalInstance.acquireTokenSilent(request);
        return response.accessToken;
    } catch (error) {
        console.error('Token acquisition failed:', error);
        return null;
    }
}

// Fetch CSV from OneDrive using Microsoft Graph API
async function fetchCSVFromOneDrive() {
    // Method 1: Try using a direct public share link first (simplest)
    if (ONEDRIVE_CONFIG.shareLink && ONEDRIVE_CONFIG.shareLink !== 'YOUR_ONEDRIVE_SHARE_LINK') {
        try {
            const response = await fetch(ONEDRIVE_CONFIG.shareLink);
            if (response.ok) {
                return await response.text();
            }
        } catch (error) {
            console.error('Failed to fetch from share link:', error);
        }
    }
    
    // Method 2: Use Microsoft Graph API with authentication
    const token = await getAccessToken();
    if (!token) {
        throw new Error('Unable to authenticate with OneDrive');
    }
    
    const graphEndpoint = `https://graph.microsoft.com/v1.0/me/drive/root:${ONEDRIVE_CONFIG.filePath}:/content`;
    
    const response = await fetch(graphEndpoint, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });
    
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

// Parse time string (e.g., "3:00 PM" or "15:00") and return Date object for today
function parseMatchTime(timeStr, dateStr) {
    if (!timeStr || timeStr === 'N/A') {
        return null;
    }
    
    const today = new Date();
    const dateParts = dateStr.split('-'); // Assuming YYYY-MM-DD format
    const year = parseInt(dateParts[0]);
    const month = parseInt(dateParts[1]) - 1; // Month is 0-indexed
    const day = parseInt(dateParts[2]);
    
    // Parse time
    const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (!timeMatch) {
        return null;
    }
    
    let hours = parseInt(timeMatch[1]);
    const minutes = parseInt(timeMatch[2]);
    const period = timeMatch[3];
    
    // Convert to 24-hour format
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
    
    // Group matches by court
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
    
    // For each court, find the next match
    const nextMatches = {};
    
    Object.keys(courtMatches).forEach(court => {
        const courtGames = courtMatches[court].sort((a, b) => a.parsedTime - b.parsedTime);
        
        // Find the next game: current game (within 10 mins of start) or upcoming game
        let nextMatch = null;
        
        for (const match of courtGames) {
            const matchTime = match.parsedTime;
            const tenMinutesAfterStart = new Date(matchTime.getTime() + 10 * 60 * 1000);
            
            // If current time is before 10 minutes after match start, this is the next match
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
    
    // Sort courts by name
    const sortedCourts = Object.keys(nextMatches).sort();
    
    sortedCourts.forEach(court => {
        const match = nextMatches[court];
        const now = new Date();
        const matchTime = match.parsedTime;
        const tenMinutesAfterStart = new Date(matchTime.getTime() + 10 * 60 * 1000);
        
        // Determine if match is live or upcoming
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
        
        const csvText = await fetchCSVFromOneDrive();
        const matches = parseCSV(csvText);
        
        displayMatches(matches);
        updateLastUpdateTime();
        
    } catch (error) {
        console.error('Error loading matches:', error);
        loading.style.display = 'none';
        errorDiv.style.display = 'block';
        errorDiv.textContent = `Error loading matches: ${error.message}. Please check your configuration.`;
    }
}

// Initialize the app
async function init() {
    // Initialize MSAL if available
    initializeMSAL();
    
    // Update current time every second
    updateCurrentTime();
    setInterval(updateCurrentTime, 1000);
    
    // Load matches immediately
    await loadMatches();
    
    // Refresh matches every 2 minutes
    setInterval(loadMatches, 2 * 60 * 1000);
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
