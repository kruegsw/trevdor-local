
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
        
export function rulesCheck({state, action}) {
        
        const currentPlayer = state.players[state.activePlayerIndex];



        /*
        function bonusByColor(cards, colors) {
                const out = {};
                for (const c of colors) out[c] = 0;
                        for (const card of (cards ?? [])) {
                        const b = card?.bonus;
                        (out[b]++);
                        }
                return out;
        }

        function countPendingTokens(tokens) {
                return Object.values(tokens).reduce((sum, n) => sum + n, 0);
        }

        function countMaxPerColor(tokens) {
                return Object.values(tokens).reduce((max, n) => Math.max(max, n), 0);
        }

        function countBonusColorFromCards(cards, color) { 
                const grouped = bonusByColor(cards, ["white","blue","green","red","black"]);
                return grouped[color];
        }

        function availableFundsForCard(card) {
                let check = true;
                const cost = card.meta.cost;

                const bonus = bonusByColor(currentPlayer.cards, ["white","blue","green","red","black"]);

                let short = 0;

                for (const [c, need] of Object.entries(cost)) {
                        const have = (bonus[c] ?? 0) + (currentPlayer.tokens[c] ?? 0);
                        if (have < need) short += (need - have);
                }

                if ((currentPlayer.tokens["yellow"] ?? 0) < short) check = false;
                return check;
        }
        */

        let check = true
        switch (action.type) {
                case "TAKE_TOKENS":

                        /*
                        if (state.market.bank[color] < 1) {check = false} // bank has at least one token of that color
                        if (countPendingTokens(pending.tokens) > 2) {check = false} // cannot take more than 3 tokens
                        if (countMaxPerColor(pending.tokens) > 1) {check = false} // cannot have two tokens of the same color in-hand
                        if (pending.tokens[color] &&  // if taking a second token of the same color already pending ...
                                (countPendingTokens(pending.tokens) > 1 || // ... the first token must be the only other token in pending
                                state.market.bank[color] < 4) // ... and the bank must have 4 tokens of that color
                        ) {check = false}
                        if ( (countPendingTokens(currentPlayer.tokens) + countPendingTokens(pending.tokens)) > 9
                        ) {check = false} // prevent player from picking up more than 10 tokens
                         */
                        break;
                case "BUY_CARD":
                        //if (!availableFundsForCard(card)) {check = false} // player has sufficient bonus and tokens to buy card
                        break;
                case "RESERVE_CARD":
                        //if (currentPlayer.reserved.length > 2) {check = false} // max 3 reserved cards
                        break;
                default:
                        break;
        }
        return check
}

        