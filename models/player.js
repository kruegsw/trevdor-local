class Player {  // future models/player.js
    constructor({ playerName }) {
        this.playerName = playerName
        this.tokens = { // temporary tokens in hand
            black: 0,
            blue: 0,
            green: 0,
            red: 0,
            white: 0,
            yellow: 0
        }
        this.cards = []
        this.reserved = [] // reserved Cards
    }

    #points() {  // aka prestige points based on cards and nobles held
        // function which tallies up point on cards
    }

    #bonuses() { // aka permanent gem discount based on cards held
        // function which tallies up point on cards
    }

    #selectTokens() {
        // player selects to pick up token
            // two of same color (if 5 or more in stack)
            //
    }

}
