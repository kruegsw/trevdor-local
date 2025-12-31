class Card {
    constructor(tier, gem, cost, points = 0) {
        this.tier = tier
        this.gem = gem
        this.cost = cost
        this.points = points
    }
}

class Player {
    constructor({playerName}) {
        this.playerName = playerName
        this.tokens = { // aka gem tokens
            black: 0,
            blue: 0,
            green: 0,
            red: 0,
            white: 0
        }
        this.cards = []
        this.round = 1
    }

    #points() {  // aka prestige points
        // function which tallies up point on cards
    }

    #gems() { // aka permanent Gems
        // function which tallies up point on cards
    }

    #selectTokens() {
        // player selects to pick up token
            // two of same color (if 5 or more in stack)
            //
    }

}

class Game {
    constructor(players) {
        this.players = players
        this.deck = this.#createDeck()
        this.tokens = this.#createTokens()
        // determine player order
        this.#playGame()
    }

    cardsOnBoard() {
        let cardsOnBoard = {}
        cardsOnBoard.tier.one = []
        cardsOnBoard.tier.two = []
        cardsOnBoard.tier.three = []
        cardsOnBoard.tier.nobles = []
        // fiter deck for tier and show appropriate number of cards based on number of players
        return cardsOnBoard // {tier: {one: [], two: [], three []}}
    }

    #createDeck() {
        let deck = this.#createCards()
        this.#shuffleDeck(deck)
        return deck
    }

    #createCards() {
        let deck = [ // create cards for each tier
         
        ]
        return deck
    }

    #shuffleDeck(deck) {
        // randomly shuffle cards in deck
        return deck
    }

    #createTokens() {
        let tokens = []// create tokens based on number of players
        return tokens
    }

    #playGame() {
        //      player either buys a card or selects tokens
        //          ensure player can buy card
        //          adhere to token selection rule
        //      update game status
        //          player status (cards, tokens, points)
        //          board status (cards on board, player status for UI)
        //      determine if winner
        //          end game if winner
        //      next Player turn      
    }

}


