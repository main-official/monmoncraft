const Auth = {
    activeUsers: new Map(),
    
    login(username) {
        const errorElement = document.getElementById('errorMessage');
        
        // Validate username exists in allowed list
        if (!CONFIG.ALLOWED_USERNAMES.includes(username)) {
            errorElement.textContent = 'Invalid username. Please contact the server owner.';
            return;
        }
        
        // Check if username is already in use
        if (this.activeUsers.has(username)) {
            errorElement.textContent = 'This username is already in use. Please try again later.';
            return;
        }
        
        // Register user
        this.activeUsers.set(username, {
            joinTime: Date.now(),
            peerId: null
        });
        
        // Store in session storage
        sessionStorage.setItem('username', username);
        sessionStorage.setItem('sessionId', this.generateSessionId());
        
        // Redirect to game
        window.location.href = 'game.html';
    },
    
    getCurrentUser() {
        return sessionStorage.getItem('username');
    },
    
    logout(username) {
        this.activeUsers.delete(username);
        sessionStorage.removeItem('username');
        sessionStorage.removeItem('sessionId');
    },
    
    generateSessionId() {
        return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    },
    
    getOtherUsername() {
        const current = this.getCurrentUser();
        return CONFIG.ALLOWED_USERNAMES.find(u => u !== current);
    }
};

// Handle page unload to free up username
window.addEventListener('beforeunload', () => {
    const user = Auth.getCurrentUser();
    if (user) {
        Auth.logout(user);
    }
});
