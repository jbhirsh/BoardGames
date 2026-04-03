// ── KEYWORD MAP ──────────────────────────────────────────
const KW = {
  'social-deduction':'Social Deduction','bluffing':'Bluffing','deduction':'Deduction',
  'strategy':'Strategy','negotiation':'Negotiation','abstract':'Abstract','deck-building':'Deck-Building',
  'cooperative':'Cooperative','team':'Team',
  'party':'Party','adult':'Adult','active':'Active / Physical','creative':'Creative',
  'card-game':'Card Game','word':'Word',
  'family':'Family','classic':'Classic','thematic':'Thematic','portable':'Portable','quick-play':'Quick Play',
};

// Each game has a primary group for "Group by Type" sort
const GROUPS = {
  'social': 'Social Deduction',
  'word':   'Word & Clue',
  'party':  'Party & Active',
  'strat':  'Strategy',
  'coop':   'Cooperative',
};
const GROUP_ORDER = ['social','word','party','strat','coop'];

// ── GAME DATA ────────────────────────────────────────────
const GAMES = [
  { name:"One Night Werewolf",       players:"3–10", min:3,  max:10, dur:"10 min",    mins:10,  cat:"quick",  group:'social',
    kw:['social-deduction','bluffing','party','quick-play'],
    short:"Hidden roles, one frantic vote, ten minutes — then play again.",
    desc:"Everyone gets a secret role — Werewolf, Villager, Seer, Troublemaker. Close your eyes while the night phase plays out via the free app, then argue about who the werewolves are. One vote, one elimination, ten minutes. Then play again immediately.",
    detail:`<div class="detail-section"><h3>How It Works</h3><p>Each player secretly receives a role card — Werewolf, Villager, Seer, Troublemaker, Drunk, and more. The free companion app narrates the night phase, waking up each role in turn to take their action. No one sees what anyone else does. Then it's daytime: five minutes of chaos.</p></div><div class="detail-section"><h3>The Debate</h3><p>Everyone argues, accuses, and deflects simultaneously. Unlike traditional Werewolf, there's no elimination mid-game — just one final group vote at the end. The catch: your role might have been swapped in the night without you knowing it. The Troublemaker switches two players' cards; the Drunk takes a card blind from the centre. You might be voting for yourself.</p></div><div class="detail-section"><h3>Why It Works</h3><p>It compresses all the tension of a 90-minute game into ten minutes. No downtime, no sitting out, no memory strain. Because every round is completely fresh and takes almost no time to reset, you'll play five or six rounds in a row without realising it.</p></div>`,
    yt:"how to play One Night Ultimate Werewolf tutorial" },
  { name:"One Night Daybreak",       players:"3–7",  min:3,  max:7,  dur:"10 min",    mins:10,  cat:"quick",  group:'social',
    kw:['social-deduction','bluffing','party','quick-play'],
    short:"New roles (Alpha Wolf, Witch, Curator) for One Night — plays standalone or combined.",
    desc:"Expansion to One Night Werewolf with powerful new roles: Alpha Wolf, Curator, Witch, and more. Plays standalone or mixed via the app. Adds complexity while keeping the lightning-fast 10-minute runtime.",
    detail:`<div class="detail-section"><h3>New Roles</h3><p>Daybreak introduces roles that fundamentally change the wolf team's dynamics. The Alpha Wolf can convert a Villager into a Werewolf during the night. The Witch swaps her own card with any other card on the table. The Curator assigns an artifact to another player — a bonus or curse they can't reveal.</p></div><div class="detail-section"><h3>Standalone or Mixed</h3><p>Daybreak works perfectly as a standalone game, but its real power is in combination. The companion app lets you freely mix roles from Werewolf, Daybreak, and Vampire, building custom game configurations from a roster of 40+ roles. You can tune the balance for your exact group each session.</p></div><div class="detail-section"><h3>Learning Curve</h3><p>The expanded role set adds a layer of plausible deniability that experienced players will love — "I'm the Alpha Wolf, so I swapped myself to Villager." Bluffing becomes multilayered. Best introduced to groups who already have a few Werewolf games under their belt.</p></div>`,
    yt:"how to play One Night Ultimate Daybreak tutorial" },
  { name:"One Night Vampire",        players:"3–10", min:3,  max:10, dur:"10 min",    mins:10,  cat:"quick",  group:'social',
    kw:['social-deduction','bluffing','party','quick-play'],
    short:"The One Night formula goes gothic — mix with Werewolf via the app for huge games.",
    desc:"The One Night formula goes gothic — Vampires, Renfield, Priest, and more. Mixes seamlessly with Werewolf and Daybreak via the companion app for massive combined sessions.",
    detail:`<div class="detail-section"><h3>The Vampire Team</h3><p>Vampire introduces a third faction alongside Villagers and Werewolves. The Vampire team wins if a Villager — not a Werewolf — is voted out. The Renfield is a human who secretly sides with the Vampires. The Priest can mark a player as protected against vampiric conversion.</p></div><div class="detail-section"><h3>Three-Way Tension</h3><p>With three factions vying for different outcomes, the daytime discussion becomes genuinely unpredictable. Werewolves might actually want to help vote out a Villager alongside Vampires — but they can't reveal why without exposing themselves. Alliances form and collapse in five minutes.</p></div><div class="detail-section"><h3>Big Group Potential</h3><p>Vampire supports up to 10 players, and the app scales perfectly. Combined with Werewolf and Daybreak roles, you can run sessions with 15+ role cards in the mix for massive groups — making it the ideal party-of-party game when the whole room wants in.</p></div>`,
    yt:"how to play One Night Ultimate Vampire tutorial" },
  { name:"Suspicion",                players:"2–6",  min:2,  max:6,  dur:"30–60 min", mins:60,  cat:"medium", group:'social',
    kw:['deduction','family'],
    short:"You're a disguised jewel thief — deduce who everyone else is before they deduce you.",
    desc:"You're a jewel thief disguised as a party guest — and so is everyone else. Everyone controls the same characters, but only you know which disguise is yours. Deduce theirs before they deduce yours.",
    detail:`<div class="detail-section"><h3>The Setup</h3><p>Every player secretly receives a character card — a disguised jewel thief at a masquerade party. Everyone can control every character on the board on their turn. But each action you take leaves clues: which characters you move, which gems you take, how you use the special abilities all narrow down who you are.</p></div><div class="detail-section"><h3>Deduction Engine</h3><p>On your turn you move two characters and take gems or use abilities. You get secret informant cards that tell you what another player's character is NOT, helping you build your suspect grid. The game rewards calm, systematic elimination while managing the board state to hide your own identity.</p></div><div class="detail-section"><h3>Why It Stands Out</h3><p>Unlike most deduction games, Suspicion has no downtime — you're watching every move made by every player, even on their turns. It scales gracefully from 2 players (tight, cerebral) to 6 (chaotic, fast-reading). The 30–60 minute runtime and simple rules make it a strong pick for mixed-experience groups.</p></div>`,
    yt:"how to play Suspicion board game tutorial" },
  { name:"Analyze Me",               players:"3–10", min:3,  max:10, dur:"30–60 min", mins:60,  cat:"medium", group:'social',
    kw:['party','social-deduction'],
    short:"Answer revealing questions anonymously; the group guesses who wrote what.",
    desc:"Players answer revealing questions and the group guesses who wrote what. Sparks genuine conversation and surprising self-revelations. A brilliant icebreaker for people who think they already know each other.",
    detail:`<div class="detail-section"><h3>How to Play</h3><p>A question card is drawn — something like "What's your biggest fear?" or "What's one thing you've never told anyone?" Everyone writes their answer anonymously. The reader collects and shuffles the answers, then reads them aloud. The group votes on who they think wrote each one.</p></div><div class="detail-section"><h3>Points and Strategy</h3><p>You score points both for correctly identifying who wrote an answer and for fooling other players into misattributing yours. This creates an incentive to either be honest (if you think no one will guess you) or strategically misdirect — writing something believably out of character.</p></div><div class="detail-section"><h3>The Social Magic</h3><p>The real value isn't in the points — it's the conversations that erupt afterward. "Wait, that was you? I never would have thought…" moments happen constantly. It works brilliantly as an icebreaker for new groups and as a revelation engine for people who think they know each other well. Best with 5–8 players who are comfortable being a little vulnerable.</p></div>`,
    yt:"how to play Analyze Me party game" },
  { name:"Codenames",                players:"3–8",  min:3,  max:8,  dur:"15–30 min", mins:30,  cat:"medium", group:'word',
    kw:['word','party','team','deduction'],
    short:"One-word clues to link multiple agents — without touching the assassin.",
    desc:"Two spymasters give one-word clues to guide their teams to the right words on a 5×5 grid — without landing on the assassin. Connecting multiple words with one clue while avoiding enemies is deceptively hard. Possibly the best party game ever made.",
    detail:`<div class="detail-section"><h3>The Core Mechanic</h3><p>A 5×5 grid of words is dealt out. Each team has a spymaster who can see a secret key card showing which words belong to which team, and which single word is the assassin. The spymaster gives a one-word clue followed by a number — "Vehicle: 3" means three of your team's words relate to that clue. Operatives guess, and the turn ends when they miss or choose to stop.</p></div><div class="detail-section"><h3>The Tension</h3><p>The assassin is instant loss. The bystanders waste your turn. Enemy words advance the other team. Every clue is a calculated risk — the temptation to link four words with one brilliant clue is constantly undermined by the near-miss that ends your game. Watching your team confidently guess wrong is agonising in the best possible way.</p></div><div class="detail-section"><h3>Replayability and Variants</h3><p>The 200+ included word cards generate thousands of different boards. Codenames Pictures replaces words with surreal images for a different challenge. Duet is a fully cooperative two-player variant. The base game has been translated into over 40 languages and is consistently ranked among the top 50 games of all time on BoardGameGeek.</p></div>`,
    yt:"how to play Codenames board game tutorial" },
  { name:"Bananagrams",              players:"2–8",  min:2,  max:8,  dur:"15 min",    mins:15,  cat:"quick",  group:'word',
    kw:['word','quick-play','portable','family'],
    short:"Real-time race to build your own personal crossword — no board needed.",
    desc:"Race to build your own crossword grid from letter tiles faster than everyone else. No turns, completely real-time. Fast, frantic, and perfectly portable — just a banana-shaped bag of tiles.",
    detail:`<div class="detail-section"><h3>The Race</h3><p>All players start with a set of letter tiles face down. On "Split!" everyone flips them over and simultaneously races to arrange all their tiles into a connected crossword grid — no board, no shared space, completely independent. The first to finish shouts "Peel!" and everyone takes a new tile from the bunch.</p></div><div class="detail-section"><h3>Tile Management</h3><p>If you're stuck with an impossible letter (a Q with no U in sight), you can "dump" it back into the bunch and take three new tiles as a penalty. Managing when to dump versus when to restructure your entire grid is the hidden skill of Bananagrams. Sometimes tearing apart a working grid to accommodate a new letter is faster than trying to patch around it.</p></div><div class="detail-section"><h3>Portability and Variants</h3><p>The entire game fits in a banana-shaped pouch that slips into any bag. Setup is zero. The official rules include variants like Banana Smoothie (collaborative) and Banana Cafe (played with a smaller grid target). It runs equally well with two competitive adults or a family with a 10-year-old, making it one of the most versatile small games available.</p></div>`,
    yt:"how to play Bananagrams tutorial rules" },
  { name:"Taboo",                    players:"4–10", min:4,  max:10, dur:"20–60 min", mins:60,  cat:"medium", group:'word',
    kw:['word','party','team'],
    short:"Describe the word without using the five most obvious clues — get buzzed if you slip.",
    desc:"Get your team to say the target word without using the five most obvious clue words on the card. The opposing team watches for violations. Fast, frantic, and revealing about how differently people's minds connect ideas.",
    detail:`<div class="detail-section"><h3>The Rules</h3><p>On your turn you have 60 seconds to get your teammates to say as many target words as possible. Each card shows the target at the top and five forbidden words below — the obvious routes all blocked. Say any forbidden word and the opposing team buzzes you and you skip that card. Use gestures, sounds, song, anything except the forbidden words or word fragments.</p></div><div class="detail-section"><h3>The Challenge</h3><p>The forbidden words are specifically chosen to block your most intuitive paths. "Treasure" with GOLD, CHEST, BURY, PIRATE, and MAP forbidden. You're forced to reach for lateral connections — metaphors, context clues, sentence fragments — under time pressure while your whole team shouts guesses at you. It reveals a lot about how people think.</p></div><div class="detail-section"><h3>Social Energy</h3><p>Taboo generates a specific kind of group energy — everyone leaning forward, the buzzer hovering, half the table laughing, the other half straining. The 20–60 minute runtime is flexible; teams can play to any point target. Works best with 6–10 players split evenly, though 4 players is perfectly playable.</p></div>`,
    yt:"how to play Taboo card game tutorial rules" },
  { name:"Poetry for Neanderthals",  players:"2+",   min:2,  max:99, dur:"15 min",    mins:15,  cat:"quick",  group:'word',
    kw:['word','party','quick-play','portable','team'],
    short:"Give clues in one-syllable words only — or face the inflatable club.",
    desc:"Give clues using only one-syllable words — use a longer word and get bonked with an inflatable club. Like Taboo with a caveman rulebook. Surprisingly hard and consistently hilarious.",
    detail:`<div class="detail-section"><h3>One Syllable Only</h3><p>Each card has a word worth 3 points on the front and a simpler word worth 1 point on the back. The clue-giver must describe it using only single-syllable words. "Rock that you throw in the sea to make it skip" is legal. "Pebble" is not. The moment a multi-syllable word escapes, someone in the opposite team gets to dramatically bonk the clue-giver with the included inflatable club.</p></div><div class="detail-section"><h3>Why It's Harder Than It Sounds</h3><p>You don't realise how much of everyday language is polysyllabic until you're forbidden from using it under pressure. Words like "animal," "music," "table" are all off the table. It forces you into staccato caveman constructions — "the big, grey beast with the long nose and big ears" — while your teammates shout increasingly wrong guesses.</p></div><div class="detail-section"><h3>The Inflatable Club</h3><p>The physical punishment element — mild, foam, and theatrical — transforms a word game into a performance. Players start hamming up the bonks. The clue-giver braces for impact. The whole table gets involved. Setup takes under a minute, plays in 15, and works from age 8 to 80 without modification.</p></div>`,
    yt:"how to play Poetry for Neanderthals tutorial" },
  { name:"Exploding Kittens",        players:"2–5",  min:2,  max:5,  dur:"15 min",    mins:15,  cat:"quick",  group:'party',
    kw:['card-game','party','quick-play','portable'],
    short:"Draw cards until someone explodes — unless they Defuse it. Absurdist, fast, chaotic.",
    desc:"Draw cards until someone draws an Exploding Kitten — they're out unless they Defuse it. Play Skip, Attack, See the Future, and Shuffle to redirect danger toward rivals. Fast, chaotic, funny.",
    detail:`<div class="detail-section"><h3>The Core Loop</h3><p>On your turn you play any number of action cards, then draw from the deck. Hidden somewhere in that deck are Exploding Kittens equal to one fewer than the number of players. Draw one and you're eliminated — unless you have a Defuse card. Defuse cards let you put the Exploding Kitten back anywhere in the deck, so you can bury it at the top to immediately punish the next player.</p></div><div class="detail-section"><h3>The Cards</h3><p>Skip ends your turn without drawing. Attack forces the next player to take two consecutive turns. See the Future lets you peek at the top three cards. Shuffle randomises the deck when you know a bomb is buried at position two. Nope cancels almost any other card — including another Nope. Combining cards creates combos that let you steal from opponents.</p></div><div class="detail-section"><h3>The Vibe</h3><p>The Oatmeal's absurdist artwork — laser cats, burritos in birthday hats, cats dressed as sharks — gives the game a distinctive irreverent personality. It plays best with the maximum five players when elimination pressure is highest. The original crowdfunding campaign raised $8.8 million from 219,000 backers, making it the most-backed Kickstarter in history at the time.</p></div>`,
    yt:"how to play Exploding Kittens card game tutorial" },
  { name:"Taco vs Burrito",          players:"2–4",  min:2,  max:4,  dur:"15 min",    mins:15,  cat:"quick",  group:'party',
    kw:['card-game','family','quick-play','portable'],
    short:"Stack ingredients to build the wildest food — then sabotage everyone else's. Kid-invented.",
    desc:"Build the most outrageous taco or burrito by stacking ingredient cards, then sabotage opponents with action cards. Invented by a 7-year-old. Accessible to kids but fast enough for adults.",
    detail:`<div class="detail-section"><h3>The Game</h3><p>Players take turns drawing ingredient cards and choosing whether to add them to their own taco or burrito, or play action cards to mess with rivals. Ingredients like Hot Sauce, Sour Cream, and Mysterious Goop have point values — some positive, some negative. The wildest, most disgusting combination that racks up the most points wins.</p></div><div class="detail-section"><h3>Action Cards</h3><p>Trash Panda lets you steal from an opponent's pile. Food Fight makes everyone pass their entire meal to the left. Order Up forces a player to eat their own creation and start again. The action cards are where most of the chaos lives, and they hit hard in a 15-minute game where a single steal can invert the entire standings.</p></div><div class="detail-section"><h3>The Backstory</h3><p>Alex Butler invented this game at age 7 after his parents told him an idea he had was impossible to execute. He proved them wrong. The game became a viral sensation, sold over a million copies, and is now stocked at Target nationwide. It plays equally well with adults who appreciate the chaotic strategy as with kids who just want to yell about cheese.</p></div>`,
    yt:"how to play Taco vs Burrito card game tutorial" },
  { name:"Taco Goat Cheese Pizza",   players:"3–8",  min:3,  max:8,  dur:"15 min",    mins:15,  cat:"quick",  group:'party',
    kw:['card-game','party','quick-play','portable','active'],
    short:"Recite the sequence — slap when the card matches. Louder and faster than it sounds.",
    desc:"Flip cards while reciting the sequence — but when a card matches your current word, slap the pile instead. Faster and louder than it sounds. Gets the whole table shouting and second-guessing themselves.",
    detail:`<div class="detail-section"><h3>The Sequence</h3><p>Players take turns flipping cards from their hand into the centre while calling out words in a repeating sequence: Taco, Goat, Cheese, Pizza, and then special cards for Narwhal, Chicken, and Waffle. You always say the next word in the sequence regardless of what card is actually played — except when your card matches your word. Then you slap.</p></div><div class="detail-section"><h3>The Confusion</h3><p>Your brain wants to say what's on the card. But you have to say the next sequence word. When they match, your brain locks up for half a second — and that half second is what everyone is waiting for. The special animal cards require sounds or gestures instead of slapping, adding another layer of override to execute under pressure.</p></div><div class="detail-section"><h3>Why It Works at Any Age</h3><p>The disconnect between what you see and what you're supposed to do creates a universal cognitive stumble that's just as amusing for adults as for children. There's no strategy — it's pure reflex and pattern suppression. Games last 10–15 minutes, require no setup, and the cards fit in a pocket. An ideal travel game or between-meal filler at a long dinner.</p></div>`,
    yt:"how to play Taco Goat Cheese Pizza card game tutorial" },
  { name:"Throw Throw Burrito",      players:"2–6",  min:2,  max:6,  dur:"30 min",    mins:30,  cat:"medium", group:'party',
    kw:['card-game','party','active'],
    short:"Card-matching game that erupts into real-time foam burrito dodgeball. Stand up first.",
    desc:"A card-matching game that erupts into real-time dodgeball. Collect matching sets, but when a battle card appears grab a foam burrito and pelt someone. Expect screaming and furniture casualties.",
    detail:`<div class="detail-section"><h3>The Card Game Part</h3><p>Players pass cards around the table, collecting matching sets of three to score points. Standard card matching, simple and quick. But mixed throughout the deck are Battle Cards — and when they come up, everything changes instantly.</p></div><div class="detail-section"><h3>The Burrito Part</h3><p>Three types of Battle Cards trigger different brawls. Burrito War means everyone grabs a foam burrito and attacks whoever they like until someone calls stop. Burrito Duel means two named players square off back-to-back and draw — first hit wins. Burrito Brawl is a free-for-all where getting hit costs you a card. The foam burritos are included and are deeply satisfying to throw.</p></div><div class="detail-section"><h3>Logistics</h3><p>The game requires space — players standing or seated with room to throw and dodge. Clear a table, clear a room. Best played with 4–6 people who don't mind mild violence. The 30-minute runtime is approximate; games end when someone gets hit enough to run out of points. Bruises are theoretical. Laughter is guaranteed.</p></div>`,
    yt:"how to play Throw Throw Burrito tutorial" },
  { name:"Cards Against Humanity",   players:"4–20+",min:4,  max:99, dur:"30–90 min", mins:90,  cat:"medium", group:'party',
    kw:['card-game','party','adult'],
    short:"Fill-in-the-blank with the most disturbing answer you can play. Know your crowd.",
    desc:"A black card poses a question or fill-in-the-blank. Everyone plays their funniest (or most disturbing) white card. The Card Czar picks the winner. Deliberately offensive — know your crowd.",
    detail:`<div class="detail-section"><h3>The Format</h3><p>A rotating Card Czar draws a black card containing a question or fill-in-the-blank statement. Every other player anonymously submits one or more white cards as their answer. The Card Czar reads them aloud (fully committing to the performance is half the fun) and picks their favourite. The winner keeps the black card as a point.</p></div><div class="detail-section"><h3>The Cards</h3><p>The 500+ white cards range from the mundane to the genuinely disturbing. The comedy comes from unexpected combinations — a completely innocent prompt paired with a horrifying answer, or a grotesque prompt met with something absurdly banal. The game rewards knowing your audience: what lands with close friends might clear a room of strangers.</p></div><div class="detail-section"><h3>Know Your Crowd</h3><p>The box literally says "A party game for horrible people." The content is deliberately transgressive — race, death, sex, and bodily functions are all common territory. It works brilliantly as a group bonding exercise among people who know each other well and have compatible senses of humour. Equally important: it works terribly when even one person is uncomfortable. Read the room before dealing.</p></div>`,
    yt:"how to play Cards Against Humanity tutorial rules" },
  { name:"For the Girls",            players:"3+",   min:3,  max:99, dur:"30–60 min", mins:60,  cat:"medium", group:'party',
    kw:['party','adult','team'],
    short:"Rowdy challenges, dares, and questions across seven categories — perfect for girls' nights.",
    desc:"A rowdy party game designed for women with challenges, dares, and questions across seven categories. Teams work through fast-paced mini-games that escalate in outrageousness. Perfect for hen nights and birthdays.",
    detail:`<div class="detail-section"><h3>The Categories</h3><p>Cards fall into seven colour-coded categories: Would You Rather (dilemmas), Most Likely To (voted by the group), Challenges (physical or performance tasks), Trivia, Confessions, Superlatives (rank players), and Dares. The mix keeps gameplay unpredictable and ensures no single personality type dominates — there's something for the competitive, the shy, and the unhinged.</p></div><div class="detail-section"><h3>How Scoring Works</h3><p>Players move around a board by completing challenges correctly or being voted the winner of a round. Some cards reward the person who completes the dare most dramatically; others eliminate the last-place finisher from a round. The game can be played competitively (first to finish wins) or casually (just play until you're bored).</p></div><div class="detail-section"><h3>The Occasion</h3><p>Designed specifically for hen nights, birthdays, and girls' nights in. The content gets progressively more adult as rounds accumulate — early cards are tame enough for mixed groups, later ones trend toward the raucous. Best with 5–10 players and drinks, in a setting where everyone's comfortable being a bit ridiculous. The box doubles as a surprisingly elegant decoration piece.</p></div>`,
    yt:"how to play For the Girls card game tutorial" },
  { name:"Cranium",                  players:"4+",   min:4,  max:99, dur:"1 hr",      mins:60,  cat:"long",   group:'party',
    kw:['party','team','word','creative'],
    short:"Four skill types (sculpt, trivia, word, perform) — every personality gets a turn to shine.",
    desc:"A team game spanning Creative Cat (sculpt, draw), Data Head (trivia), Word Worm (spelling), and Star Performer (act, hum, whistle). Everyone gets a moment to shine across its four very different categories.",
    detail:`<div class="detail-section"><h3>The Four Skill Zones</h3><p>Creative Cat covers sculpting with clay and drawing (with eyes closed, or with your non-dominant hand). Data Head is trivia — science, history, pop culture. Word Worm includes spelling backwards, unscrambling anagrams, and completing fill-in-the-blanks. Star Performer is humming songs, acting them out, or doing celebrity impersonations. The genius is that every player has at least one category where they're unstoppable.</p></div><div class="detail-section"><h3>Team Dynamics</h3><p>Teams of 2–4 move around the board by completing challenges in 60–120 seconds. Harder challenges require just the reader, while others are collaborative team efforts. The clay sculpting rounds generate more table laughter than almost any other game mechanic in existence — watching someone desperately sculpt "the Eiffel Tower" in 60 seconds is a universal experience.</p></div><div class="detail-section"><h3>The Social Experience</h3><p>Cranium was specifically designed by former Microsoft employees who felt traditional trivia games were too exclusive. The brief was: a game where every player is brilliant at least once per session. It succeeds. The one-hour runtime feels active throughout, with enough category variety that no team can coast. Best with 6–8 players and four to a team.</p></div>`,
    yt:"how to play Cranium board game tutorial rules" },
  { name:"Uno",                      players:"2–10", min:2,  max:10, dur:"15–30 min", mins:30,  cat:"medium", group:'party',
    kw:['card-game','family','portable','classic'],
    short:"Match colors and numbers; yell UNO; wreak havoc with Wild Draw Fours. Timeless.",
    desc:"Match colors or numbers to empty your hand. Play action cards — Skip, Reverse, Draw Two, Wild — to disrupt rivals at key moments. Shout 'UNO!' when down to one card. Timeless, universal, somehow always dramatic.",
    detail:`<div class="detail-section"><h3>The Rules</h3><p>Each player starts with 7 cards. On your turn, play a card matching the colour or number of the top discard pile card, or play a Wild. Can't play? Draw one and either play it or pass. First to empty their hand wins the round and scores points equal to what's left in everyone else's hands. First to 500 wins.</p></div><div class="detail-section"><h3>The Action Cards</h3><p>Skip makes the next player lose their turn. Reverse flips the play direction (devastating in two-player). Draw Two forces the next player to take two cards and skip their turn. Wild lets you call any colour. Wild Draw Four does all of that and forces a four-card draw — and can only be legally played if you have no colour match, though policing this is theoretically the entire drama of advanced Uno.</p></div><div class="detail-section"><h3>The Cultural Weight</h3><p>Uno has been in continuous print since 1971. The "house rules" debate — can you stack Draw Twos? Does playing a 7 make you swap hands? — is a genuine social bonding ritual that plays out differently in every family. The game has sold over 150 million copies. Somewhere in the world, approximately 1% of all humans are currently playing or arguing about Uno.</p></div>`,
    yt:"how to play Uno card game rules tutorial" },
  { name:"Azul",                     players:"2–4",  min:2,  max:4,  dur:"30–45 min", mins:45,  cat:"medium", group:'strat',
    kw:['strategy','abstract','family'],
    short:"Draft gorgeous tiles to complete your mosaic — incomplete rows incur penalties.",
    desc:"Draft beautiful glazed tiles from factory displays to complete rows on your board, then score them on a mosaic pattern. Every tile you take deprives opponents. Gorgeous components, deep strategy, clean rules.",
    detail:`<div class="detail-section"><h3>The Drafting Phase</h3><p>Five factory displays are seeded with four tiles each at the start of every round. On your turn you take all tiles of one colour from one factory, pushing the rest to the centre. Or you take all tiles of one colour from the centre — but the first player to take from the centre each round claims the first-player token and a one-point penalty. It sounds simple until you realise every single decision you make is simultaneously feeding or starving your opponents.</p></div><div class="detail-section"><h3>Building the Mosaic</h3><p>Tiles you draft go into your pattern rows — rows of 1, 2, 3, 4, and 5 slots. A row must be completed before the end of the round to transfer tiles to your scoring wall. The wall has a fixed pattern; each colour can appear only once in each row and column. Incomplete rows dump their tiles to the floor line, where they cost penalty points. Managing overflow is as important as building efficiently.</p></div><div class="detail-section"><h3>Why It Works</h3><p>Azul won the Spiel des Jahres (Game of the Year) in 2018 — the most prestigious award in board gaming. The physical components are exceptional: thick tactile tiles that feel like polished stone. The rulebook fits on two pages. The strategic depth is surprising and unfolds gradually over the first few plays. It teaches in five minutes and rewards mastery over dozens of sessions.</p></div>`,
    yt:"how to play Azul board game tutorial" },
  { name:"7 Wonders",                players:"2–7",  min:2,  max:7,  dur:"60 min",    mins:60,  cat:"long",   group:'strat',
    kw:['strategy','classic'],
    short:"Draft cards across three ages to build a wonder — plays in 60 min no matter the headcount.",
    desc:"Develop one of the ancient world's seven wonders across three ages by drafting cards. Pick one, pass your hand, repeat. Build military, science, commerce, and guild networks. Plays in 60 minutes regardless of player count.",
    detail:`<div class="detail-section"><h3>Card Drafting</h3><p>Each of three ages plays identically: everyone is simultaneously dealt a hand of cards, picks one to play (or discard for coins, or use to build their wonder stage), then passes the remainder to the next player. This simultaneous play is why 7 Wonders scales so beautifully — 2 players and 7 players take exactly the same amount of time, because there's almost no waiting.</p></div><div class="detail-section"><h3>Victory Paths</h3><p>Military cards win or lose you points based on comparisons with your immediate neighbours each age — pure positional pressure. Science cards score exponentially as you collect sets of three different symbols or multiples of the same. Commerce cards generate coins and resource bonuses from neighbours. Guild cards score based on other players' achievements. A winning strategy usually combines two or three tracks without neglecting the others entirely.</p></div><div class="detail-section"><h3>The Wonder Boards</h3><p>Each player's wonder board represents a different ancient civilisation — Giza, Babylon, Olympia, Rhodes, Alexandria, Ephesus, Halicarnassus. Each has three stages to build, each granting a powerful permanent ability. The asymmetry of wonder powers combined with the card draft creates a remarkably different game feel each session. Consistently rated in the top 50 games ever made.</p></div>`,
    yt:"how to play 7 Wonders board game tutorial Watch It Played" },
  { name:"Catan",                    players:"3–6",  min:3,  max:6,  dur:"60 min",    mins:60,  cat:"long",   group:'strat',
    kw:['strategy','negotiation','classic','family'],
    short:"Harvest resources, build settlements, trade ruthlessly — the game that started it all.",
    desc:"Settle the island of Catan by harvesting resources to build roads, settlements, and cities. Trade with others, deploy the robber to block rivals. First to 10 victory points wins. The game that brought modern board gaming to millions.",
    detail:`<div class="detail-section"><h3>Resource Economy</h3><p>Catan's hexagonal board is randomly assembled each game, creating a unique island of Ore, Grain, Lumber, Brick, and Wool territories. Each territory has a number token (2–12, except 7). When that number is rolled, every player with a settlement or city adjacent to that territory collects resources. Building roads, new settlements, cities, and development cards all cost specific resource combinations.</p></div><div class="detail-section"><h3>The Robber and Trading</h3><p>Rolling a 7 activates the Robber — you move it to any territory, blocking resource collection there and stealing one card from an adjacent player. Players with more than 7 cards must discard half. The Robber creates targeted conflict in an otherwise cooperative-feeling economy. Trading is the social heart of the game: anyone can offer anything to anyone on your turn, creating alliances, side deals, and betrayals.</p></div><div class="detail-section"><h3>Cultural Impact</h3><p>Catan, first published in 1995, is widely credited with sparking the modern board game renaissance. It was the first European-style strategy game to achieve mainstream success in North America and the UK. Over 40 million copies have been sold. Silicon Valley tech culture adopted it as a networking tool — "we played Catan" became shorthand for "we figured out how to work together under pressure."</p></div>`,
    yt:"how to play Catan Settlers of Catan tutorial" },
  { name:"Ticket to Ride – Europe",  players:"2–5",  min:2,  max:5,  dur:"30–60 min", mins:60,  cat:"medium", group:'strat',
    kw:['strategy','family','classic'],
    short:"Claim train routes across Europe to complete secret destination tickets.",
    desc:"Claim train routes across Europe by collecting and spending matching coloured cards. Complete secret destination tickets for big points. Block rivals before they finish. Tunnels, ferries, and stations add depth.",
    detail:`<div class="detail-section"><h3>The Route-Building Core</h3><p>The board shows a map of Europe with cities connected by coloured route segments. On your turn you either draw train cards, claim a route by spending matching cards (a blue four-segment route costs four blue cards), or draw destination tickets — secret cards showing two cities that score big if you connect them, but cost points if you don't. Managing multiple destination tickets simultaneously is the core strategic challenge.</p></div><div class="detail-section"><h3>Europe-Specific Rules</h3><p>The Europe version adds three mechanics absent from the original USA map. Tunnels are grey routes in mountain passes — when you attempt them, three additional cards are flipped and you must pay for any matching colours revealed (or abandon the attempt). Ferries require locomotives (wild cards) alongside regular cards. Stations let you use one of an opponent's completed routes to complete your own ticket — each player has only three.</p></div><div class="detail-section"><h3>Why It Endures</h3><p>Ticket to Ride Europe won the Spiel des Jahres in 2005 and remains one of the most accessible gateway strategy games available. The 30-minute taught-to-playing time and near-zero luck in the final stages make it ideal for introducing non-gamers to strategic play. The blocking and route-racing tension escalates naturally over the first 45 minutes before the final scoring creates a satisfying, often dramatic conclusion.</p></div>`,
    yt:"how to play Ticket to Ride Europe board game tutorial" },
  { name:"Ticket to Ride",             players:"2–5",  min:2,  max:5,  dur:"30–60 min", mins:60,  cat:"medium", group:'strat',
    kw:['strategy','family','classic'],
    short:"Claim train routes across America to complete secret destination tickets — the original classic.",
    desc:"Claim train routes across North America by collecting and playing matching coloured train cards. Complete secret destination tickets connecting distant cities for bonus points — but fail to connect and they count against you. The game that launched a franchise.",
    detail:`<div class="detail-section"><h3>The Core Mechanic</h3><p>The board shows a map of North America with cities connected by coloured route segments of varying lengths. On your turn you either draw train cards from a face-up display or blind draw, claim a route by spending matching cards (e.g. four green cards for a green four-segment route), or draw new destination tickets. Longer routes score exponentially more points, but shorter routes are safer to complete.</p></div><div class="detail-section"><h3>Destination Tickets</h3><p>Each destination ticket names two cities — connect them with a continuous path of your claimed routes and score the ticket's point value; fail and lose those points. The tension between drawing more tickets for bigger scores and risking incomplete routes is the game's central decision. Experienced players learn to chain overlapping tickets through shared corridors, maximising efficiency.</p></div><div class="detail-section"><h3>Why It's a Classic</h3><p>Ticket to Ride won the Spiel des Jahres in 2004 and has sold over 10 million copies. Designer Alan R. Moon created perhaps the perfect gateway game: teach in 10 minutes, play in 45, and discover strategic depth over dozens of sessions. The cross-country route network creates natural chokepoints where players compete for critical connections, generating tension without direct conflict. A staple of every serious board game collection.</p></div>`,
    yt:"how to play Ticket to Ride board game tutorial" },
  { name:"Risk",                     players:"2–5",  min:2,  max:5,  dur:"1–8 hrs",   mins:480, cat:"long",   group:'strat',
    kw:['strategy','negotiation','classic'],
    short:"Global domination via dice, armies, and alliances you will absolutely betray.",
    desc:"The original game of global domination. Deploy armies, invade territories, forge alliances, and shatter them. Games can last all afternoon as empires rise and collapse. Legendary for ending friendships. Clear your calendar.",
    detail:`<div class="detail-section"><h3>The War Machine</h3><p>The world map is divided into 42 territories across 6 continents. Players draft and place armies, then take turns attacking adjacent territories by rolling dice — attacker rolls up to 3, defender rolls up to 2, highest dice win (defender wins ties). A successful campaign requires chaining victories to claim entire continents, which provide reinforcement bonuses that compound rapidly.</p></div><div class="detail-section"><h3>Diplomacy and Betrayal</h3><p>No rules govern alliances — they exist entirely outside the game mechanics, enforced only by social pressure. The combination of a formal rule system and informal diplomacy creates a game environment where trust is a strategic resource with real risk. Classic Risk is particularly famous for the moment when the player who's been quietly building in Australia explodes across the board in the final third.</p></div><div class="detail-section"><h3>The Commitment</h3><p>Risk is the game that requires "we're doing this today" energy. The 1–8 hour range is real: with 5 players and aggressive tactics, a game can last a full afternoon. Modern variants like Risk: Legacy (permanent board modifications that persist across campaigns) and Secret Mission Risk (each player has a hidden win condition) address the runtime and endgame staleness. But the original remains the definitive alliance-betrayal experience in board gaming.</p></div>`,
    yt:"how to play Risk board game tutorial rules" },
  { name:"Pandemic",                 players:"2–4",  min:2,  max:4,  dur:"45 min",    mins:45,  cat:"medium", group:'coop',
    kw:['cooperative','strategy','thematic'],
    short:"Work together as disease specialists to cure four global outbreaks before time runs out.",
    desc:"Work together as specialists to cure four diseases spreading across the globe. Manage outbreaks, build research stations, discover cures before the deck runs out. Brutally difficult, deeply satisfying.",
    detail:`<div class="detail-section"><h3>The Disease System</h3><p>Four coloured diseases spread across a world map of 48 cities. After each player's turn, two infection cards are drawn — the named cities gain a disease cube. When a city reaches three cubes and would receive a fourth, it outbreaks: all adjacent cities gain a cube, potentially triggering chain outbreaks. Eight outbreaks and the game is lost. So is losing all cubes of one colour, or drawing the final player card.</p></div><div class="detail-section"><h3>The Roles</h3><p>Each player takes a specialist role with a unique power: the Medic removes all cubes of one colour in one action instead of one at a time. The Scientist needs only four cards to discover a cure instead of five. The Dispatcher can move other players' pawns. The Operations Expert builds research stations for free. Coordinating roles — getting the Medic to a hot zone while the Researcher shares critical cards — is the cooperative puzzle at the game's heart.</p></div><div class="detail-section"><h3>Difficulty and Legacy</h3><p>The base game plays on four difficulty levels; the hardest is genuinely brutal. Pandemic has spawned a legacy series — Pandemic Legacy: Season 1 is consistently rated the #1 game of all time on BoardGameGeek, where decisions in early sessions permanently alter the board and components in later ones. For groups who enjoy Pandemic and want a campaign experience, the legacy versions are essential.</p></div>`,
    yt:"how to play Pandemic board game tutorial Watch It Played" },
  { name:"Mysterium",                players:"2–7",  min:2,  max:7,  dur:"45 min",    mins:45,  cat:"medium", group:'coop',
    kw:['cooperative','deduction','thematic','creative'],
    short:"One player is a ghost sending surreal dream-card visions; everyone else solves the murder.",
    desc:"One player is a ghost communicating only through surreal illustrated vision cards. Everyone else decodes the visions to identify the killer, location, and weapon. Cooperative, creative, unlike anything else.",
    detail:`<div class="detail-section"><h3>The Ghost's Perspective</h3><p>One player is the Ghost — silent, playing behind a screen, communicating exclusively through illustrated vision cards depicting surreal dreamscapes. The Ghost must guide each investigator to the correct suspect, location, and weapon associated with them — but can only communicate by choosing which vision cards to send. The Ghost can see exactly who's on the right track and who is interpreting everything backwards, but cannot say a word.</p></div><div class="detail-section"><h3>The Investigators' Challenge</h3><p>Each investigator has a set of suspect portraits, location illustrations, and weapon cards laid out in front of them. When they receive a vision card — a dreamlike image that might show a crumbling staircase, floating fish, or geometric patterns — they must decide which of their options the Ghost is pointing toward. Investigators discuss openly; the Ghost's agony is silent. Wrong guesses cost clock tokens. The game has seven rounds.</p></div><div class="detail-section"><h3>The Final Act</h3><p>If all investigators identify their suspect, location, and weapon in time, a final vote occurs to determine the true culprit across all boards. The Ghost sends three final vision cards pointing toward the real murderer. Investigators who scored high earlier get additional vote advantages. The table-wide discussion that follows the reveal — "I said it was the butler the whole time" — is where Mysterium lives. The artwork alone is worth owning the game.</p></div>`,
    yt:"how to play Mysterium board game tutorial" },
  { name:"Hogwarts Battle",          players:"2–4",  min:2,  max:4,  dur:"30–60 min", mins:60,  cat:"medium", group:'coop',
    kw:['cooperative','deck-building','thematic'],
    short:"Cooperative Harry Potter deck-builder spanning seven chapters that unlock new cards.",
    desc:"A cooperative deck-builder following Harry Potter across seven progressively harder chapters. Play as Harry, Hermione, Ron, or Neville, acquiring spells while fighting villains. New cards unlock each chapter.",
    detail:`<div class="detail-section"><h3>Deck Building Basics</h3><p>Each player starts with a ten-card starter deck. On your turn you play cards to generate two resources: influence (used to acquire new spells, items, and allies from the market) and attack (used to deal damage to the active villain). Defeated villains are removed from the game; new ones enter at the start of each turn until all villains for the chapter are defeated. Your deck shuffles and cycles constantly — building it efficiently is the central skill.</p></div><div class="detail-section"><h3>The Chapter System</h3><p>The game is packaged as seven sealed boxes corresponding to the seven books. Book 1 uses a simple starter set; each subsequent book opens a new sealed envelope of cards with more complex mechanics, stronger villains, and more dangerous effects. Dark Arts events batter the heroes each turn. Locations can be "controlled" by villains, gaining persistent negative effects until driven off. The difficulty curve is deliberately calibrated — Book 4 onward gets genuinely hard.</p></div><div class="detail-section"><h3>Thematic Integration</h3><p>The character asymmetry is thoughtfully designed. Harry's deck focuses on card draw and allies. Hermione generates influence. Ron gains defensive bonuses. Neville's starter is weak but develops the most powerful late-game presence. The villain roster, spell names, and event flavour text pull directly from the books — recognising "Wingardium Leviosa" or watching Voldemort enter play for the first time gives the game emotional weight that purely abstract deck-builders can't replicate.</p></div>`,
    yt:"how to play Harry Potter Hogwarts Battle deck building tutorial" },
];

const WISHLIST = [
  { name:"Lost Cities",             desc:"An elegant two-player card game of expeditions. Do you commit or hold back? Deceptively tense, quick, and endlessly replayable — the head-to-head filler you don't own yet.", yt:"how to play Lost Cities board game tutorial" },
  { name:"Dominion",                desc:"The game that invented deck-building. Each session uses a different set of 10 kingdom cards — no two games alike. Strategic depth in a 30-minute package.", yt:"how to play Dominion board game tutorial" },
  { name:"Nemesis",                 desc:"Cinematic sci-fi survival on an alien-infested spaceship. Semi-cooperative with secret objectives — expect tension, betrayal, and dramatic deaths.", yt:"how to play Nemesis board game tutorial" },
  { name:"Blood on the Clocktower", desc:"The most acclaimed social deduction game ever made. 100+ roles, a storyteller mechanic, and dead players who stay active. Perfect for 10–15 people.", yt:"how to play Blood on the Clocktower tutorial" },
  { name:"Splendor",                desc:"Collect gem tokens, buy development cards, and attract nobles. Deceptively simple engine-building with beautiful components and surprisingly deep decisions.", yt:"how to play Splendor board game tutorial" },
];

// ── STATE ────────────────────────────────────────────────
let durF='all', plrF=0, kwF=new Set(), sortF='az', baseSortF='az', viewF='list';

// ── DROPDOWN MANAGEMENT ──────────────────────────────────
let openDD = null;
function toggleDD(id) {
  if (openDD === id) { closeDD(); return; }
  closeDD();
  openDD = id;
  document.getElementById(id+'-panel').classList.add('open');
  document.getElementById(id+'-btn').classList.add('open');
  if (id === 'kw') setTimeout(() => document.getElementById('kw-search').focus(), 40);
}
function closeDD() {
  if (!openDD) return;
  document.getElementById(openDD+'-panel').classList.remove('open');
  document.getElementById(openDD+'-btn').classList.remove('open');
  openDD = null;
}
document.addEventListener('click', e => { if (!e.target.closest('.dd-wrap')) closeDD(); });

// ── BUILD PLAYER OPTIONS ─────────────────────────────────
const CHK = `<svg viewBox="0 0 9 7" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 3.5l2.5 2.5 4.5-5"/></svg>`;
function buildPlrOpts() {
  const nums = [2,3,4,5,6,7,8,10];
  document.getElementById('plr-opts').innerHTML =
    `<div class="dd-opt sel" data-p="0" onclick="pickPlr(0,this)"><div class="dd-chk">${CHK}</div>Any count</div>` +
    nums.map(n => {
      const c = GAMES.filter(g => g.min <= n && g.max >= n).length;
      return `<div class="dd-opt" data-p="${n}" onclick="pickPlr(${n},this)"><div class="dd-chk">${CHK}</div>${n===10?'10+ players':`${n} players`}<span class="dd-opt-ct">${c}</span></div>`;
    }).join('');
}

// ── BUILD KEYWORD OPTIONS ────────────────────────────────
function renderKwOpts() {
  const q = (document.getElementById('kw-search').value || '').toLowerCase().trim();
  const used = new Set(GAMES.flatMap(g => g.kw));
  const entries = Object.entries(KW).filter(([k,v]) => used.has(k) && (!q || v.toLowerCase().includes(q)));
  const wrap = document.getElementById('kw-opts');
  if (!entries.length) { wrap.innerHTML = '<div class="dd-nores">No keywords found</div>'; return; }
  wrap.innerHTML = entries.map(([k,label]) => {
    const c = GAMES.filter(g => g.kw.includes(k)).length;
    const sel = kwF.has(k);
    return `<div class="dd-opt${sel?' sel':''}" data-kw="${k}" onclick="toggleKw('${k}',this)"><div class="dd-chk">${CHK}</div>${label}<span class="dd-opt-ct">${c}</span></div>`;
  }).join('');
}

// ── FILTER ACTIONS ───────────────────────────────────────
const DUR_L = { all:'Duration', quick:'≤ 15 min', medium:'30–60 min', long:'60+ min' };
function pickDur(v, el) {
  durF = v;
  document.querySelectorAll('#dur-opts .dd-opt').forEach(o => o.classList.remove('sel'));
  el.classList.add('sel');
  const btn = document.getElementById('dur-btn');
  document.getElementById('dur-lbl').textContent = DUR_L[v];
  btn.classList.toggle('active', v !== 'all');
  closeDD(); render(); refreshTags();
}
function clearDur(e) { e.stopPropagation(); pickDur('all', document.querySelector('#dur-opts .dd-opt[data-v="all"]')); }

function pickPlr(n, el) {
  plrF = n;
  document.querySelectorAll('#plr-opts .dd-opt').forEach(o => o.classList.remove('sel'));
  el.classList.add('sel');
  const btn = document.getElementById('plr-btn');
  document.getElementById('plr-lbl').textContent = n===0?'Players':n===10?'10+ players':`${n} players`;
  btn.classList.toggle('active', n > 0);
  closeDD(); render(); refreshTags();
}
function clearPlr(e) { e.stopPropagation(); pickPlr(0, document.querySelector('#plr-opts .dd-opt[data-p="0"]')); }

function toggleKw(k, el) {
  if (kwF.has(k)) kwF.delete(k); else kwF.add(k);
  el.classList.toggle('sel', kwF.has(k));
  updateKwBtn(); render(); refreshTags();
}
function updateKwBtn() {
  const btn = document.getElementById('kw-btn');
  const lbl = document.getElementById('kw-lbl');
  if (kwF.size===0) { lbl.textContent='Keywords'; btn.classList.remove('active'); }
  else if (kwF.size===1) { lbl.textContent=KW[[...kwF][0]]; btn.classList.add('active'); }
  else { lbl.textContent=`${kwF.size} keywords`; btn.classList.add('active'); }
}
function clearKw(e) { e.stopPropagation(); kwF.clear(); renderKwOpts(); updateKwBtn(); render(); refreshTags(); }

function addKwFromCard(k) {
  if (kwF.has(k)) kwF.delete(k); else kwF.add(k);
  renderKwOpts(); updateKwBtn(); render(); refreshTags();
}

function pickSort(v, el) {
  sortF = v; baseSortF = v;
  document.querySelectorAll('[data-sv]').forEach(o => o.classList.remove('sel'));
  el.classList.add('sel');
  const labels = { group:'Group by Type', az:'A → Z', quick:'Quickest First', long:'Longest First' };
  document.getElementById('sort-lbl').textContent = labels[v] || 'Sort';
  closeDD(); render();
}

function clearAll() {
  durF='all'; plrF=0; kwF.clear();
  document.getElementById('search').value = '';
  document.getElementById('dur-lbl').textContent = 'Duration';
  document.getElementById('dur-btn').classList.remove('active');
  document.getElementById('plr-lbl').textContent = 'Players';
  document.getElementById('plr-btn').classList.remove('active');
  document.querySelectorAll('#dur-opts .dd-opt').forEach((o,i) => o.classList.toggle('sel', i===0));
  document.querySelectorAll('#plr-opts .dd-opt').forEach((o,i) => o.classList.toggle('sel', i===0));
  updateKwBtn(); renderKwOpts(); render(); refreshTags();
}

function removeKwTag(k) { kwF.delete(k); renderKwOpts(); updateKwBtn(); render(); refreshTags(); }

function refreshTags() {
  const tags = [];
  if (durF !== 'all') tags.push(`<span class="atag" onclick="clearDur(event)">Duration: ${DUR_L[durF]}</span>`);
  if (plrF > 0) tags.push(`<span class="atag" onclick="clearPlr(event)">Players: ${plrF===10?'10+':plrF}</span>`);
  kwF.forEach(k => tags.push(`<span class="atag" onclick="removeKwTag('${k}')">${KW[k]}</span>`));
  document.getElementById('atag-list').innerHTML = tags.join('');
  document.getElementById('atags').classList.toggle('show', tags.length > 0);
}

// ── VIEW TOGGLE ──────────────────────────────────────────
function setView(v) {
  viewF = v;
  document.getElementById('vbtn-grid').classList.toggle('active', v==='grid');
  document.getElementById('vbtn-list').classList.toggle('active', v==='list');
  render();
}

// ── SORT LOGIC ───────────────────────────────────────────
function sortGames(list) {
  if (sortF === 'az' || sortF === 'name-asc')  return [...list].sort((a,b) => a.name.localeCompare(b.name));
  if (sortF === 'name-desc') return [...list].sort((a,b) => b.name.localeCompare(a.name));
  if (sortF === 'quick' || sortF === 'dur-asc') return [...list].sort((a,b) => a.mins - b.mins);
  if (sortF === 'long'  || sortF === 'dur-desc') return [...list].sort((a,b) => b.mins - a.mins);
  if (sortF === 'players-asc')  return [...list].sort((a,b) => a.min - b.min || a.max - b.max);
  if (sortF === 'players-desc') return [...list].sort((a,b) => b.min - a.min || b.max - a.max);
  // default: group then alpha within group
  return [...list].sort((a,b) => {
    const gi = GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group);
    return gi !== 0 ? gi : a.name.localeCompare(b.name);
  });
}

function clickColSort(col, e) {
  e.stopPropagation();
  sortF = sortF === col+'-asc' ? col+'-desc' : col+'-asc';
  document.querySelectorAll('[data-sv]').forEach(o => o.classList.remove('sel'));
  document.getElementById('sort-lbl').textContent = 'Sort';
  render();
}

// ── RENDER ───────────────────────────────────────────────
const YT_SVG = `<svg width="14" height="14" viewBox="0 0 24 24"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.75 15.5v-7l6.25 3.5-6.25 3.5z"/></svg>`;
const DUR_PILL_L = { quick:'Quick', medium:'Medium', long:'Long' };
function ytURL(q) { return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q); }

function render() {
  const q = (document.getElementById('search').value || '').toLowerCase().trim();
  let list = GAMES;
  if (durF==='quick')  list = list.filter(g => g.mins <= 15);
  if (durF==='medium') list = list.filter(g => g.mins > 15 && g.mins <= 60);
  if (durF==='long')   list = list.filter(g => g.mins > 60);
  if (plrF > 0)        list = list.filter(g => g.min <= plrF && g.max >= plrF);
  if (kwF.size > 0)    list = list.filter(g => [...kwF].every(k => g.kw.includes(k)));
  if (q)               list = list.filter(g => g.name.toLowerCase().includes(q) || g.desc.toLowerCase().includes(q));

  list = sortGames(list);
  document.getElementById('gcount').textContent = list.length + ' game' + (list.length !== 1 ? 's' : '');
  const cont = document.getElementById('games-container');

  if (!list.length) {
    cont.innerHTML = viewF === 'grid'
      ? `<div class="games-grid"><div class="no-results"><p>No games match your filters.</p><button class="no-results-btn" onclick="clearAll()">Clear all filters</button></div></div>`
      : `<div class="games-list"><p class="no-results-list">No games match your filters. <button style="background:none;border:none;color:var(--blue);cursor:pointer;font-family:inherit;font-size:inherit;" onclick="clearAll()">Clear all</button></p></div>`;
    return;
  }

  if (viewF === 'grid') renderGrid(list, cont);
  else renderList(list, cont);
}

function rulesURL(name) {
  return 'https://www.google.com/search?q=' + encodeURIComponent(name + ' board game rules PDF');
}

function renderGrid(list, cont) {
  let html = '<div class="games-grid">';
  let lastGroup = null;
  list.forEach(g => {
    if (sortF === 'group' && g.group !== lastGroup) {
      lastGroup = g.group;
      html += `<div class="group-hd" style="grid-column:1/-1">${GROUPS[g.group]}</div>`;
    }
    const kwHTML = sortedKw(g.kw).map(k => `<span class="kw-pill${kwF.has(k)?' lit':''}" onclick="addKwFromCard('${k}')">${KW[k]||k}</span>`).join('');
    html += `
    <div class="game-card">
      <div class="card-head">
        <div class="card-row1" style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:8px;">
          <div class="card-name">${g.name}</div>
          <span class="dur-pill dur-${g.cat}">${DUR_PILL_L[g.cat]}</span>
        </div>
        <div class="card-meta">
          <div class="cmeta"><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5.5" r="2.5" stroke="currentColor" stroke-width="1.3"/><path d="M3 14c0-2.76 2.24-5 5-5s5 2.24 5 5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>${g.players}</div>
          <div class="cmeta"><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.3"/><path d="M8 5v3.5l2 1.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>${g.dur}</div>
        </div>
      </div>
      <div class="card-kw">${kwHTML}</div>
      <div class="card-body"><p class="card-desc">${g.desc}</p></div>
      <div style="padding:10px 18px 14px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px;">
        <a class="rules-btn" href="${rulesURL(g.name)}" onclick="event.preventDefault();window.open(this.href,'_blank')" title="Find rules PDF">${PDF_SVG}</a>
        <a class="row-yt" href="${ytURL(g.yt)}" onclick="event.preventDefault();window.open(this.href,'_blank')">${YT_SVG}</a>
      </div>
    </div>`;
  });
  html += '</div>';
  cont.innerHTML = html;
}

const CHEVRON = `<svg class="row-chevron" viewBox="0 0 12 12" fill="none"><path d="M2 4l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const PDF_SVG = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 2a1 1 0 0 1 1-1h6l3 3v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2z" stroke="currentColor" stroke-width="1.3"/><path d="M9 1v3h3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M5.5 9.5h5M5.5 11.5h3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><rect x="5" y="6.5" width="6" height="1.5" rx=".5" fill="currentColor" opacity=".35"/></svg>`;

function sortedKw(kw) {
  return [...kw].sort((a, b) => (KW[a]||a).localeCompare(KW[b]||b));
}

function toggleRow(el) {
  const row = el.closest('.game-row');
  const isOpen = row.classList.contains('open');
  document.querySelectorAll('.game-row.open').forEach(r => r.classList.remove('open'));
  if (!isOpen) row.classList.add('open');
}

function pickDurFromRow(cat, e) {
  e.stopPropagation();
  if (durF === cat) {
    // deselect — same as clicking "Any length"
    pickDur('all', document.querySelector('#dur-opts .dd-opt[data-v="all"]'));
  } else {
    durF = cat;
    document.querySelectorAll('#dur-opts .dd-opt').forEach(o => o.classList.toggle('sel', o.dataset.v === cat));
    document.getElementById('dur-lbl').textContent = DUR_L[cat];
    document.getElementById('dur-btn').classList.add('active');
    render(); refreshTags();
  }
}

function thSort(col, label, extraCls='') {
  const asc = col+'-asc', desc = col+'-desc';
  const isAsc  = sortF === asc;
  const isDesc = sortF === desc;
  const cls = [extraCls, (isAsc || isDesc) ? ('sortable ' + (isAsc ? 'sort-asc' : 'sort-desc')) : 'sortable'].filter(Boolean).join(' ');
  const icon = isDesc ? '▼' : '▲';
  return `<th class="${cls}" onclick="clickColSort('${col}',event)">${label}<span class="sort-icon">${icon}</span></th>`;
}

function renderList(list, cont) {
  const NCOLS = 6;
  let html = `<div class="table-wrap"><table class="games-list">
  <thead><tr>
    ${thSort('name','Game')}
    ${thSort('players','Players','col-hide col-players-h')}
    ${thSort('dur','Duration')}
    <th class="col-hide col-desc">Description</th>
    <th class="col-hide col-tags">Tags</th>
    <th style="width:28px"></th>
  </tr></thead>
  <tbody>`;

  let lastGroup = null;
  list.forEach(g => {
    const skw = sortedKw(g.kw);
    const kwCols = skw.map(k =>
      `<span class="kw-pill${kwF.has(k)?' lit':''}" onclick="event.stopPropagation();addKwFromCard('${k}')">${KW[k]||k}</span>`
    ).join('');
    const kwExp = skw.map(k =>
      `<span class="kw-pill${kwF.has(k)?' lit':''}" onclick="event.stopPropagation();addKwFromCard('${k}')">${KW[k]||k}</span>`
    ).join('');

    if (sortF === 'group' && g.group !== lastGroup) {
      lastGroup = g.group;
      html += `<tr class="group-header-row"><td colspan="${NCOLS}"><span class="group-header-label">${GROUPS[g.group] || g.group}</span></td></tr>`;
    }

    const detailHTML = (g.detail || '').replace(/\n/g,'');

    html += `
    <tr class="game-row" onclick="toggleRow(this)">
      <td><div class="col-name-wrap"><span class="col-name">${g.name}</span>${sortF==='group'?`<span class="group-badge">${GROUPS[g.group]}</span>`:''}<span class="mobile-short">${g.short}</span></div></td>
      <td class="col-hide col-players-h"><span class="col-players">${g.players}</span></td>
      <td><span class="row-dur dur-${g.cat}" onclick="pickDurFromRow('${g.cat}',event)" title="Filter: ${DUR_PILL_L[g.cat]}">${g.dur}</span></td>
      <td class="col-hide col-desc"><span class="col-short">${g.short}</span></td>
      <td class="col-hide col-tags col-kw">${kwCols}</td>
      <td class="col-actions">${CHEVRON}</td>
    </tr>
    <tr class="row-expand" onclick="event.stopPropagation()">
      <td colspan="${NCOLS}">
        <div class="row-expand-inner">
          <div class="row-expand-content">
            ${detailHTML}
            <div class="row-expand-kw">${kwExp}</div>
            <div class="row-expand-foot">
              <a class="rules-link" href="${rulesURL(g.name)}" onclick="event.preventDefault();window.open(this.href,'_blank')">${PDF_SVG}<span>Rules PDF</span></a>
              <a class="row-yt" href="${ytURL(g.yt)}" onclick="event.preventDefault();window.open(this.href,'_blank')">${YT_SVG}</a>
            </div>
          </div>
        </div>
      </td>
    </tr>`;
  });

  html += '</tbody></table></div>';
  cont.innerHTML = html;
}

function renderWishlist() {
  document.getElementById('wish-grid').innerHTML = WISHLIST.map(w => `
    <div class="wish-card">
      <div class="wish-lbl">Wishlist</div>
      <div class="wish-name">${w.name}</div>
      <div class="wish-desc">${w.desc}</div>
      <a class="wish-yt" href="${ytURL(w.yt)}" onclick="event.preventDefault();window.open(this.href,'_blank')" title="Watch Tutorial">${YT_SVG}</a>
    </div>`).join('');
}

// ── STICKY THEAD OFFSET ──────────────────────────────────
function updateTheadTop() {
  const h = document.getElementById('sticky-header').getBoundingClientRect().height;
  document.documentElement.style.setProperty('--thead-top', Math.ceil(h) + 'px');
}
new ResizeObserver(updateTheadTop).observe(document.getElementById('sticky-header'));
window.addEventListener('resize', updateTheadTop);

// ── INIT ─────────────────────────────────────────────────
document.getElementById('hero-count').textContent = GAMES.length;
document.getElementById('stat-games').textContent = GAMES.length;
document.getElementById('stat-wishlist').textContent = WISHLIST.length;
buildPlrOpts();
renderKwOpts();
render();
renderWishlist();
// Wait for fonts + full load before measuring sticky header height
document.fonts.ready.then(updateTheadTop);
window.addEventListener('load', updateTheadTop);

