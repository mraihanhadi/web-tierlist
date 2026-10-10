# Tier Rasa 🌶️

A pass-the-computer tier list game for Indonesian food and drinks.

## Run it

No build step or install is needed. Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

## How it plays

1. **Setup**: add players (as many as share the computer, up to 12) and rename them any time.
   Pick which foods and drinks to rate from the built-in list of 50+, or add your own.
2. **Play**: items come up one at a time. Each player in turn drags the item onto
   *their own* board, from tier 1 (nope) to 10 (legendary), then locks it in.
   Once everyone has placed it, the next item comes up.
3. **Results**: overall ranking by average score, a group tier list, every player's board,
   and fun stats (most divisive, taste twins, harshest critic…).

Controls during a turn: drag the card, click a tier, or press `1`–`9` / `0` (=10).
`Enter` locks it in, `Backspace` undoes, `Esc` takes the card back.

**Blind mode** hides other players' boards and shows a "pass the computer" screen between turns.

Everything, including a game in progress, is saved in the browser's `localStorage`.

## Files

- `index.html`: page shell
- `data.js`: built-in food and drink list (edit to add more)
- `app.js`: game state, rendering, drag and drop
- `styles.css`: styles (light and dark)
