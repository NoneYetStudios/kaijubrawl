/* Kaiju Brawl - configuration. Edit these constants to suit your deployment. */
window.KB = window.KB || {};

KB.CONFIG = {
  // Where the "<- STF Arcade" button sends the player.
  ARCADE_URL: 'https://arcade.stabthefinger.com',

  // Leaderboard endpoints (relative to index.html).
  API_LEADERBOARD: 'api/leaderboard.php',
  API_SUBMIT: 'api/submit_score.php',
  LEADERBOARD_SIZE: 25,
  GAMEOVER_BOARD_SIZE: 8,

  // Visual / rendering toggles.
  FILM_FX: true,
  HIDPI: false,

  VERSION: '0.1.0'
};
