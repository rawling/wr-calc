// Overall view model for the page
function ViewModel() {
    // The base rankings in an object, indexed by the ID of the team.
    this.rankingsById = ko.observable();

    // The base rankings in an array, ordered by points.
    this.baseRankings = ko.observable();

    // The date of the base rankings.
    this.originalDate = ko.observable();

    // The teams from the base rankings, used to populate the lookup.
    // We only need this separate from baseRankings if we want to sort differently.
    this.teams = ko.observableArray();

    // The fixtures used to calculate projected rankings.
    this.fixtures = ko.observableArray();

    // An indication of which set of rankings is displayed.
    // Options are null, 'original' or 'calculated'.
    this.shownRankings = ko.observable();

    // An indication of whether we have loaded fixtures from WR.
    // Not actually used yet, but could help show a loading screen.
    this.fixturesLoaded = ko.observable(false);

    // The rankings calcualted by taking the original rankings and applying
    // the fixtures.
    this.projectedRankings = ko.computed(function() {
        var rankingsById = this.rankingsById();
        var fixtures = this.fixtures();

        // Nothing to calculate if the data has not yet loaded.
        if (!rankingsById || !fixtures) {
            return null;
        }

        // We work on the rankings as we go. Duplicate the base rankings
        // and set the "old" values to the "current" values so we can 
        // show changes at the end.
        var projectedRankings = {};
        $.each(rankingsById, function (k, v) {
            var cr = new RankingViewModel(v);
            cr.previousPos(cr.pos());
            cr.previousPts(cr.pts());
            projectedRankings[v.team.id] = cr;
        });

        // Apply each fixture in turn.
        $.each(fixtures, function (index, fixture) {
            var home = projectedRankings[fixture.homeId()];
            var away = projectedRankings[fixture.awayId()];
            var homeScore = parseInt(fixture.homeScore());
            var awayScore = parseInt(fixture.awayScore());
            var noHome = fixture.noHome();
            var isRwc = fixture.isRwc();

            // Only do anything if the fixture is valid.
            // We should invert the if statement and maybe use the isValid
            // property, although maybe there's a reason we didn't before.
            if (home &&
                away &&
                home != away &&
                !isNaN(homeScore) &&
                !isNaN(awayScore)) {

                // Calculate the effective ranking of the "home" team depending on whether
                // it is really at home.
                var homeRanking = home.pts();
                if (!noHome) {
                    homeRanking = homeRanking + 3;
                }

                // Calculate the ranking diff and cap it at 10 points.
                var rankingDiff = homeRanking - away.pts();
                var cappedDiff = Math.min(10, Math.max(-10, rankingDiff));

                // A draw gives the home team one tenth of the diff.
                var drawChange = cappedDiff / 10;

                // A win gives a team one more point, a loss one less.
                // A win or loss by over 15 multiplies by 1.5.
                var homeChange;
                if (homeScore > awayScore + 15) {
                    homeChange = 1.5 * (1 - drawChange);
                } else if (homeScore > awayScore) {
                    homeChange = 1 - drawChange;
                } else if (homeScore == awayScore) {
                    homeChange = 0 - drawChange;
                } else if (homeScore < awayScore - 15) {
                    homeChange = 1.5 * (-1 - drawChange);
                } else {
                    homeChange = -1 - drawChange;
                }

                // A RWC match doubles the change.
                if (isRwc) {
                    homeChange = homeChange * 2;
                }

                // The rankings are zero-sum, so the away team loses what the home team gains.
                var awayChange = -homeChange;

                // Update the "current" values.
                home.pts(home.pts() + homeChange);
                away.pts(away.pts() + awayChange);
            }
        });

        // Sort the rankings for display and update the "current" positions.
        var sorted = [];
        $.each(projectedRankings, function (i, r) {
            sorted.push(r);
        });
        sorted.sort(function (a, b) { return b.pts() - a.pts(); });
        $.each(sorted, function (i, r) {
            r.pos(i + 1);
        });

        return sorted;
    }, this);

    return this;
};

// View model for a ranking entry.
// You can pass the raw data from the API call or an existing view model.
function RankingViewModel(rawRanking) {
    rawRanking = rawRanking || { team: {} };

    // Basic data. Unwrap in case we were passed another view model.
    // I think "previous" values are only observable because we bind the VM before we set
    // "previous" to "current" during calculation - we should be able to avoid this.
    this.team = rawRanking.team; // id, name, abbreviation
    this.pts = ko.observable(ko.utils.unwrapObservable(rawRanking.pts));
    this.pos = ko.observable(ko.utils.unwrapObservable(rawRanking.pos));
    this.previousPts = ko.observable(ko.utils.unwrapObservable(rawRanking.previousPts));
    this.previousPos = ko.observable(ko.utils.unwrapObservable(rawRanking.previousPos));

    // Display of the current ranking score - show 2DP like WR does.
    this.ptsDisplay = ko.computed(function () {
        var pts = this.pts();
        return pts.toFixed(2);
    }, this);

    // HTML display of the previous position - show in colour and with a little arrow/
    this.previousPosDisplay = ko.computed(function () {
        var pos = this.pos();
        var previousPos = this.previousPos();
        if (pos < previousPos) {
            return '<span style="color: #090">(&uarr;' + previousPos + ')</span>';
        } else if (pos > previousPos) {
            return '<span style="color: #900">(&darr;' + previousPos + ')</span>';
        } else {
            return null;
        }
    }, this);

    // HTML display of the point change from the previous rankings - colour and +/-.
    this.ptsDiffDisplay = ko.computed(function () {
        var ptsDiff = this.pts() - this.previousPts();
        if (ptsDiff > 0) {
            return '<span style="color: #090">(+' + ptsDiff.toFixed(2) + ')</span>';
        } else if (ptsDiff < 0) {
            return '<span style="color: #900">(-' + (-ptsDiff).toFixed(2) + ')</span>';
        } else {
            return null;
        }
    }, this);

    return this;
};

// View model for a fixture entry.
// Pass the parent view model to check for validity.
// Should probably be able to pass the raw data from the API here.
function FixtureViewModel(parent) {
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

// Actualyl create a view model and bind it to the HTML.
var viewModel = new ViewModel();
ko.applyBindings(viewModel);

// Load rankings from World Rugby.
$.get('//cmsapi.pulselive.com/rugby/rankings/mru.json').done(function (data) {
    var rankings = {};
    $.each(data.entries, function (i, e) {
        viewModel.teams.push({ id: e.team.id, name: e.team.name });
        rankings[e.team.id] = new RankingViewModel(e);
    });
    viewModel.rankingsById(rankings);

    var sorted = [];
    $.each(rankings, function (i, r) {
        sorted.push(r);
    });
    sorted.sort(function (a, b) { return b.pts() - a.pts(); });

    viewModel.baseRankings(sorted);
    viewModel.originalDate(data.effective.label);
    viewModel.shownRankings('original');

    // When we're done, load fixtures in.
    // This should be parallelisable if we have our observables set up properly. (Fixture validity depends on teams.)
    loadFixture();
});

// Helper to add a fixture to the top/bottom.
// If we had up/down buttons we could maybe get rid of this.
var addFixture = function (top) {
    var fixture = new FixtureViewModel(viewModel);
    if (top) {
        viewModel.fixtures.unshift(fixture);
    } else {
        viewModel.fixtures.push(fixture);
    }

    return fixture;
}

// Load fixtures from World Rugby.
loadFixture = function(  ) {
    // Load a week of fixtures from when the rankings are dated.
    // (As that is what will make it into the next rankings.)
    var rankingDate  = new Date(viewModel.originalDate());
    var from = formatDate( rankingDate );
    var to   =  formatDate( rankingDate.addDays( 7 ) );

    var url = "//cmsapi.pulselive.com/rugby/match?startDate="+from+"&endDate="+to+"&sort=asc&pageSize=100&sports=mru";

    $.get( url ).done( function( data ) {

        var rankings = viewModel.rankingsById();

        // Sort the fixtures in time order. For some reason they are not already.
        // The data contains a raw time and a hours-from-UTC float but neither the
        // raw time nor adding the UTC difference seems to get the right value.
        // Passing the date label into Date seems to parse it correctly, though.
        var fixtures = data.content;
        fixtures.sort(function (a, b) {
            var aStart = new Date(a.time.label).getTime();
            var bStart = new Date(b.time.label).getTime();
            return aStart - bStart;
        });

        // Parse each fixture into a view model, which adds it to the array.
        // (I thought I was being clever but I don't like this now.)
        $.each(fixtures, function (i, e) {
            // both Country into RANKINGS array ?
            if(rankings[e.teams[0].id] && rankings[e.teams[1].id]) {
                var fixture = addFixture();
                fixture.homeId(e.teams[0].id);
                fixture.awayId(e.teams[1].id);
                fixture.noHome(false);
                fixture.isRwc(e.events[0].rankingsWeight == 2);

                // If the match isn't unstarted (or doesn't not have live scores), add
                // the live score.
                // U is unstarted / no live score.
                // C is complete.
                // L1/LH/L2 are I believe the codes for 1st half, half time, 2nd half but I forgot.
                if (e.status !== 'U') {
                    fixture.homeScore(e.scores[0]);
                    fixture.awayScore(e.scores[1]);
                }
            }
        });

        // Once existing fixtures are laoded, add a blank one for the user.
        addFixture();

        // Once fixtures are loaded, show what effect they have on the rankings.
        viewModel.shownRankings('calculated');
    });

}

// Format a date for the fixture or rankings API call.
var formatDate = function(date) {
    var d     = new Date(date),
        month = '' + (d.getMonth() + 1),
        day   = '' + d.getDate(),
        year  = d.getFullYear();

    return [year, month, day].join('-');
}

// Add days to a date.
Date.prototype.addDays = function (d) {
    if (d) {
        var t = this.getTime();
        t = t + (d * 86400000);
        this.setTime(t);
    }
    return this;
};