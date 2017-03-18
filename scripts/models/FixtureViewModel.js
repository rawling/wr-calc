// View model for a fixture entry.
// Pass the parent view model to check for validity.
// Should probably be able to pass the raw data from the API here.
var FixtureViewModel = function (parent) {
    this.homeId = ko.observable();
    this.awayId = ko.observable();
    this.homeScore = ko.observable();
    this.awayScore = ko.observable();

    this.noHome = ko.observable();
    this.isRwc = ko.observable();

    this.isValid = ko.computed(function() {
        var rankings = parent.rankingsById();

        var home = rankings[this.homeId()];
        var away = rankings[this.awayId()];
        var homeScore = parseInt(this.homeScore());
        var awayScore = parseInt(this.awayScore());

        return home &&
            away &&
            home != away &&
            !isNaN(homeScore) &&
            !isNaN(awayScore);
    }, this);

    this.winner = ko.computed(function () {
        if (!this.isValid()) {
            return null;
        }

        var homeScore = parseInt(this.homeScore());
        var awayScore = parseInt(this.awayScore());

        if (homeScore > awayScore) return 1;
        if (awayScore > homeScore) return -1;
        return 0;
    }, this);

    this.multiplier = ko.computed(function() {
        if (!this.isValid()) {
            return null;
        }

        var multiplier = 1;

        var homeScore = parseInt(this.homeScore());
        var awayScore = parseInt(this.awayScore());
        if (homeScore > awayScore + 15 || awayScore > homeScore + 15) {
            multiplier *= 1.5;
        }

        if (this.isRwc()) {
            multiplier *= 2;
        }

        return multiplier;
    }, this);

    return this;
};