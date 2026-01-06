class Card {  // future models/card.js
    constructor({ tier, bonus = null, cost = {}, points = 0 }) {
        this.tier = tier
        this.bonus = bonus
        this.cost = cost
        this.points = points
    }
}
