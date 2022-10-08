// View model for a fixture entry.
// Pass the parent view model to check for validity.
// Should probably be able to pass the raw data from the API here.
var FixtureViewModel = function (parent) {
    this.homeId = ko.observable();
    this.awayId = ko.observable();
    this.homeScore = ko.observable();
    this.awayScore = ko.observable();

    this.homeRankingBefore = ko.observable();
    this.awayRankingBefore = ko.observable();

    this.venueName = null;
    this.liveScoreMode = null;
    this.kickoff = null;
    this.alreadyInRankings = false;
    this.liveScoreExplanation = null;

    this.noHome = ko.observable();
    this.switched = ko.observable();
    this.isRwc = ko.observable();

    this.hasValidTeams = ko.computed(function () {
        var rankings = parent.rankingsById();
        var home = rankings[this.homeId()];
        var away = rankings[this.awayId()];
        return home && away && home != away;
    }, this);

    this.isValid = ko.computed(function() {
        var homeScore = parseInt(this.homeScore());
        var awayScore = parseInt(this.awayScore());

        return this.hasValidTeams() &&
            !isNaN(homeScore) &&
            !isNaN(awayScore);
    }, this);

    this.changes = ko.computed(function () {
        var noHome = this.noHome();
        var switched = this.switched();

        // Calculate the effective ranking of the "home" team depending on whether
        // it is really at home, or at a neutral venue, or even if the home team
        // is nominally away.
        var homeRanking = this.homeRankingBefore();
        if (!noHome) {
            if (!switched) {
                homeRanking = homeRanking + 3;
            } else {
                homeRanking = homeRanking - 3;
            }
        }

        // Calculate the ranking diff and cap it at 10 points.
        var rankingDiff = this.awayRankingBefore() - homeRanking; // home is higher = home loss, away is higher = away loss
        var cappedDiff = Math.min(10, Math.max(-10, rankingDiff));

        // A draw gives the home team one tenth of the diff.
        var drawChange = cappedDiff / 10;

        var rwcMult = this.isRwc() ? 2 : 1;
        return [
            rwcMult * 1.5 * (drawChange + 1),
            rwcMult * (drawChange + 1),
            rwcMult * drawChange,
            rwcMult * (drawChange - 1),
            rwcMult * 1.5 * (drawChange - 1)
        ];
    }, this);

    this.getDisplayChange = function(index) {
        var changes = this.changes();
        if (!changes) return null;
        var change = changes[index];

        var formattedChange = Math.abs(change).toFixed(2);
        var prefix = change > 0 ? '⮜' : '';
        var suffix = change < 0 ? '⮞' : '';

        return prefix + formattedChange + suffix;
    };

    this.activeChange = ko.computed(function () {
        if (!this.isValid()) {
            return null;
        }

        var homeScore = parseInt(this.homeScore());
        var awayScore = parseInt(this.awayScore());

        if (homeScore > awayScore + 15) return 0;
        if (homeScore > awayScore) return 1;
        if (awayScore > homeScore + 15) return 4;
        if (awayScore > homeScore) return 3;
        return 2;
    }, this);

    return this;
};