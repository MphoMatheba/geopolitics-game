// My games: search by date or status, and filter by status. Needs /js/game/lists.js loaded first.
(function () {
    var table = document.querySelector('table.table');
    var search = document.getElementById('game-search');
    var status = document.getElementById('game-status');
    var count = document.getElementById('game-count');
    if (!table || !search || !status || !count || !window.GameLists) return;

    var rows = Array.prototype.slice.call(table.querySelectorAll('tbody tr'));
    var games = rows.map(function (tr) {
        return { status: tr.getAttribute('data-status'), started: tr.getAttribute('data-started') };
    });

    function apply() {
        var shown = window.GameLists.filterGames(games, { text: search.value, status: status.value });
        rows.forEach(function (tr, i) { tr.hidden = shown.indexOf(games[i]) < 0; });
        count.textContent = 'Showing ' + shown.length + ' of ' + games.length + ' games';
    }

    search.addEventListener('input', apply);
    status.addEventListener('change', apply);
    apply();
})();
