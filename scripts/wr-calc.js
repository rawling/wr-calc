function ViewModel() {
    this.rankingsById = ko.observable();
    this.baseRankings = ko.observable();
    this.originalDate = ko.observable();
    this.teams = ko.observableArray();
    this.fixtures = ko.observableArray();
    this.shownRankings = ko.observable();
    this.fixturesLoaded = ko.observable(false);

    this.calculatedRankings = ko.computed(function() {
        var rankingsById = this.rankingsById();
        var fixtures = this.fixtures();

        if (!rankingsById || !fixtures) {
            return null;
        }

        var calculatedRankings = {};
        $.each(rankingsById, function (k, v) {
            var cr = new RankingViewModel(v);
            cr.previousPos(cr.pos());
            cr.previousPts(cr.pts());
            calculatedRankings[v.team.id] = cr;
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
                var homeRanking = home.pts();
                if (!noHome) {
                    homeRanking = homeRanking + 3;
                }
                var rankingDiff = homeRanking - away.pts();
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
                home.pts(home.pts() + homeChange);
                away.pts(away.pts() + awayChange);
            }
        });

        var sorted = [];
        $.each(calculatedRankings, function (i, r) {
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

function RankingViewModel(rawRanking) {
    rawRanking = rawRanking || { team: {} };

    this.team = rawRanking.team; // id, name, abbreviation
    this.pts = ko.observable(ko.utils.unwrapObservable(rawRanking.pts));
    this.pos = ko.observable(ko.utils.unwrapObservable(rawRanking.pos));
    this.previousPts = ko.observable(ko.utils.unwrapObservable(rawRanking.previousPts));
    this.previousPos = ko.observable(ko.utils.unwrapObservable(rawRanking.previousPos));

    this.ptsDisplay = ko.computed(function () {
        var pts = this.pts();
        return pts.toFixed(2);
    }, this);

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

var viewModel = new ViewModel();
ko.applyBindings(viewModel);

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

        var rankings = viewModel.rankingsById();

        var fixtures = data.content;
        fixtures.sort(function (a, b) {
            var aStart = new Date(a.time.label).getTime();
            var bStart = new Date(b.time.label).getTime();
            return aStart - bStart;
        });

        $.each(fixtures, function (i, e) {
            // both Country into RANKINGS array ?
            if(rankings[e.teams[0].id] && rankings[e.teams[1].id]) {
                var fixture = addFixture();
                fixture.homeId(e.teams[0].id);
                fixture.awayId(e.teams[1].id);
                fixture.noHome(false);
                fixture.isRwc(e.events[0].rankingsWeight == 2);

                if (e.status !== 'U') {
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