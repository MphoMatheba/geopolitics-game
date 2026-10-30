// Searching and filtering for the lists (the Countries tab and My games).
// These are plain functions, so they can be tested without a browser.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.GameLists = factory();
})(typeof self !== 'undefined' ? self : this, function () {

    const norm = (text) => String(text == null ? '' : text).toLowerCase().trim();

    // rows: [{ name, ownerName, ownerPlayerId }]; filter: { text, owner }
    // text matches part of the country's name or its owner's name; owner is a player id ('' means everyone).
    function filterCountries(rows, filter) {
        const text = norm(filter && filter.text), owner = (filter && filter.owner) || '';
        return rows.filter(r =>
            (!text || norm(r.name).includes(text) || norm(r.ownerName).includes(text)) &&
            (!owner || r.ownerPlayerId === owner));
    }

    // games: [{ status, started }]; filter: { text, status }
    // text matches part of the start date/time or the status; status is exact ('' means all).
    function filterGames(games, filter) {
        const text = norm(filter && filter.text), status = (filter && filter.status) || '';
        return games.filter(g =>
            (!status || g.status === status) &&
            (!text || norm(g.started).includes(text) || norm(g.status).includes(text)));
    }

    return { filterCountries, filterGames };
});
