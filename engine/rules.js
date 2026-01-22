import { DEFS } from "./defs.js";

//      player takes action
        //          take 3 different tokens
        //          take 2 same color tokens (if bank >= 4 of color)
        //          reserve card (from market or top of deck) & take 1 gold if available
        //          buy a card from market or reserved
        //          obey rules:
        //              token hand limit of 10
        //              max 3 reserved
        //      award nobles
        //      update game status
        //          player status (cards, tokens, points)
        //          board status (cards on board, player status for UI)
        //      determine if winner
        //          end game if winner
        //      next Player turn  



// create cards and nobles
//new Card({ tier: "noble", bonus: null, cost: {red: 4, green: 4}, points: 3 })
// shuffle cards and nobles
// populate market with cards and nobles

export const rules = {}
