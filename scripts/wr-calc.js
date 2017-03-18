// Read query string before we do any binding as it may remove it.
var s = location.search;
var dateQuery = /d=([^&]*)/.exec(s);
var dateString = dateQuery ? dateQuery[1] : null;
var fixturesQuery = /f=([^&]*)/.exec(s);
var fixturesString = fixturesQuery ? fixturesQuery[1] : null;

// Create the view model and bind it to the HTML.
var viewModel = new ViewModel();
ko.applyBindings(viewModel);

// Load rankings from World Rugby.
$.get('//cmsapi.pulselive.com/rugby/rankings/mru.json' + (dateString ? ('?date=' + dateString) : '')).done(function (data) {
    var rankings = {};
    $.each(data.entries, function (i, e) {
        var maxLength = 15;
        e.team.displayName = e.team.name.length > maxLength ? e.team.abbreviation : e.team.name;
        e.team.displayTitle = e.team.name.length > maxLength ? e.team.name : null;

        viewModel.teams.push(e.team);
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
    viewModel.rankingsChoice('original');


    // When we're done, load fixtures in.
    if (fixturesString) {
        viewModel.fixturesString(fixturesString);
        viewModel.rankingsChoice('calculated');
        viewModel.queryString.subscribe(function (qs) {
            history.replaceState(null, '', '?' + qs);
        });
    } else {
        // This should be parallelisable if we have our observables set up properly. (Fixture validity depends on teams.)
        addFixture();
        loadFixtures();
    }
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
var loadFixtures = function(  ) {
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

            // N.B. since we add to the top, these get reversed, so reverse the order here!
            return -(aStart - bStart);
        });

        // Parse each fixture into a view model, which adds it to the array.
        // (I thought I was being clever but I don't like this now.)
        $.each(fixtures, function (i, e) {
            // both Country into RANKINGS array ?
            if(rankings[e.teams[0].id] && rankings[e.teams[1].id]) {
                var fixture = addFixture(true);
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

        // Once fixtures are loaded, show what effect they have on the rankings.
        viewModel.rankingsChoice('calculated');

        viewModel.queryString.subscribe(function (qs) {
            history.replaceState(null, '', '?' + qs);
        });
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