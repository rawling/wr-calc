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

    return this;
};