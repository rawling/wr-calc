function ViewModel() {
    this.originalRankings = ko.observable();
    this.sortedRankings = ko.observable();
    this.originalDate = ko.observable();
    this.teams = ko.observableArray();
    this.fixtures = ko.observableArray();
    this.shownRankings = ko.observable();
    this.fixturesLoaded = ko.observable(false);

    this.calculatedRankings = ko.computed(function() {
        var originalRankings = this.originalRankings();
        var fixtures = this.fixtures();

        if (!originalRankings || !fixtures) {
            return null;
        }

        var calculatedRankings = {};
        $.each(originalRankings, function (k, v) {
            var nr = {};
            nr.name = v.name;
            nr.oldPosition = v.position;
            nr.oldRanking = v.ranking;
            nr.newRanking = v.ranking;
            nr.id = v.id;
            calculatedRankings[v.id] = nr;
        });

        $.each(fixtures, function (index, fixture) {
            var home = calculatedRankings[fixture.homeId()];
            var away = calculatedRankings[fixture.awayId()];
            var homeScore = parseInt(fixture.homeScore());
            var awayScore = parseInt(fixture.awayScore());
            var noHome = fixture.noHome();
            var isRwc = fixture.isRwc();
            if (home &&
                away &&
                home != away &&
                !isNaN(homeScore) &&
                !isNaN(awayScore)) {
                var homeRanking = home.newRanking;
                if (!noHome) {
                    homeRanking = homeRanking + 3;
                }
                var rankingDiff = homeRanking - away.newRanking;
                var cappedDiff = Math.min(10, Math.max(-10, rankingDiff));
                var drawChange = cappedDiff / 10;
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
                if (isRwc) {
                    homeChange = homeChange * 2;
                }
                var awayChange = -homeChange;
                home.newRanking = home.newRanking + homeChange;
                away.newRanking = away.newRanking + awayChange;
            }
        });

        var sorted = [];
        $.each(calculatedRankings, function (i, r) {
            sorted.push(r);
        });
        sorted.sort(function (a, b) { return b.newRanking - a.newRanking; });

        $.each(sorted, function (i, r) {
            r.newPosition = i + 1;
            if (r.newPosition > r.oldPosition) {
                r.oldPositionDisplay = '<span style="color: #090">(&uarr;' + r.oldPosition + ')</span>';
            } else if (r.newPosition < r.oldPosition) {
                r.oldPositionDisplay = '<span style="color: #900">(&darr;' + r.oldPosition + ')</span>';
            } else {
                r.oldPositionDisplay = null;
            }

            if (r.newRanking > r.oldRanking) {
                r.rankingDiffDisplay = '<span style="color: #090">(+' + (r.newRanking - r.oldRanking).toFixed(2) + ')</span>';
            } else if (r.newRanking < r.oldRanking) {
                r.rankingDiffDisplay = '<span style="color: #900">(-' + (r.oldRanking - r.newRanking).toFixed(2) + ')</span>';
            } else {
                r.rankingDiffDisplay = null;
            }
        });
        return sorted;
    }, this);

    return this;
};

function FixtureViewModel(parent) {
    this.homeId = ko.observable();
    this.awayId = ko.observable();
    this.homeScore = ko.observable();
    this.awayScore = ko.observable();

    this.noHome = ko.observable();
    this.isRwc = ko.observable();

    this.isValid = ko.computed(function() {
        var rankings = parent.originalRankings();

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

var viewModel = new ViewModel();
ko.applyBindings(viewModel);

$.get('//cmsapi.pulselive.com/rugby/rankings/mru.json').done(function (data) {
    var rankings = {};
    $.each(data.entries, function (i, e) {
        viewModel.teams.push({ id: e.team.id, name: e.team.name });
        rankings[e.team.id] = {};
        rankings[e.team.id].id = e.team.id;
        rankings[e.team.id].name = e.team.name;
        rankings[e.team.id].position = e.pos;
        rankings[e.team.id].ranking = e.pts;
    });
    viewModel.originalRankings(rankings);

    var sorted = [];
    $.each(rankings, function (i, r) {
        sorted.push(r);
    });
    sorted.sort(function (a, b) { return b.ranking - a.ranking; });

    viewModel.sortedRankings(sorted);
    viewModel.originalDate(data.effective.label);
    viewModel.shownRankings('original');

    loadFixture();
});

var addFixture = function (top) {
    var fixture = new FixtureViewModel(viewModel);
    if (top) {
        viewModel.fixtures.unshift(fixture);
    } else {
        viewModel.fixtures.push(fixture);
    }

    return fixture;
}

loadFixture = function(  ) {
    var rankingDate  = new Date(viewModel.originalDate());
    var from = formatDate( rankingDate );
    var to   =  formatDate( rankingDate.addDays( 7 ) );

    var url = "//cmsapi.pulselive.com/rugby/match?startDate="+from+"&endDate="+to+"&sort=asc&pageSize=100&sports=mru";

    $.get( url ).done( function( data ) {

        var rankings = viewModel.originalRankings();
        $.each(data.content, function (i, e) {

            // both Country into RANKINGS array ?
            if(rankings[e.teams[0].id] && rankings[e.teams[1].id]) {
                var fixture = addFixture();
                fixture.homeId(e.teams[0].id);
                fixture.awayId(e.teams[1].id);
                fixture.noHome(false);
                fixture.isRwc(e.events[0].rankingsWeight == 2);

                if (e.status === 'C') {
                    fixture.homeScore(e.scores[0]);
                    fixture.awayScore(e.scores[1]);
                }
            }
        });

        addFixture();

        viewModel.shownRankings('calculated');
    });

}


var formatDate = function(date) {
    var d     = new Date(date),
        month = '' + (d.getMonth() + 1),
        day   = '' + d.getDate(),
        year  = d.getFullYear();

    return [year, month, day].join('-');
}


Date.prototype.addDays = function (d) {
    if (d) {
        var t = this.getTime();
        t = t + (d * 86400000);
        this.setTime(t);
    }
    return this;
};