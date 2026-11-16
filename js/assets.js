/* Kaiju Brawl - optional sprite atlas loader stub (implemented in M13). */
(function () {
  'use strict';
  window.KB = window.KB || {};

  KB.Assets = {
    load: function () { return Promise.resolve({ loaded: false }); },
    frame: function () { return null; }
  };
})();
