// Read query string before we do any binding as it may remove it.
var s = location.search;
var dateQuery = /d=([^&]*)/.exec(s);
var dateString = dateQuery ? dateQuery[1] : null;
var fixturesQuery = /f=([^&]*)/.exec(s);
var fixturesString = fixturesQuery ? fixturesQuery[1] : null;
var wQuery = /[?&]w\b/.test(s);

// Create the view model and bind it to the HTML.
var viewModel = new ViewModel(wQuery);
ko.applyBindings(viewModel);

// Load rankings from World Rugby.
$.get('//cmsapi.pulselive.com/rugby/rankings/' + (viewModel.isFemale ? 'w' : 'm') + 'ru.json' + (dateString ? ('?date=' + dateString) : '')).done(function (data) {
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
    viewModel.originalMillis = data.effective.millis;
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
        loadFixtures(rankings, !!dateString);
    }
});

// Helper to add a fixture to the top/bottom.
// If we had up/down buttons we could maybe get rid of this.
var addFixture = function (top, process) {
    var fixture = new FixtureViewModel(viewModel);
    if (process) {
        process(fixture);
    }

    if (top) {
        viewModel.fixtures.unshift(fixture);
    } else {
        viewModel.fixtures.push(fixture);
    }
}

// Load fixtures from World Rugby.
var loadFixtures = function(rankings, specifiedDate) {
    // Load a week of fixtures from when the rankings are dated.
    // (As that is what will make it into the next rankings.)
    // Or until next monday.
    function nextMonday() {
      var d = new Date();
      d.setDate(d.getDate() + ((7-d.getDay())%7) + 1);
      return d;
    }
    var rankingDate  = new Date(viewModel.originalDate());
    var from = formatDate( rankingDate );
    var toDate = specifiedDate ? rankingDate.addDays(7) : nextMonday();
    var to   =  formatDate( toDate );

    // We load all fixtures and eventually filter by matching teams.
    var url = "//cmsapi.pulselive.com/rugby/match?startDate="+from+"&endDate="+to+"&sort=asc&pageSize=100&page=";
    var getFixtures = function (fixtures, page, then) {
        $.get(url + page).done(function(data) {
            if (data.content.length == 100) {
                getFixtures(fixtures.concat(data.content), page + 1, then);
            } else {
                then(fixtures.concat(data.content));
            }
        });
    };

    getFixtures([], 0, function (fixtures) {
        // Sort the fixtures in time order. For some reason they are not already.
        // The data contains a raw time and a hours-from-UTC float but neither the
        // raw time nor adding the UTC difference seems to get the right value.
        // Passing the date label into Date seems to parse it correctly, though.
        fixtures.sort(function (a, b) {
            var aStart = new Date(a.time.label).getTime();
            var bStart = new Date(b.time.label).getTime();

            // N.B. since we add to the top, these get reversed, so reverse the order here!
            return -(aStart - bStart);
        });

        // We make extra AJAX requests for any fixture with a venue in the hope of working out
        // if the home team has advantage.
        // Keep track of those here, so we can check when all queries are finished and subscribe
        // to the query string then.
        var anyQueries = false;
        var venueQueries = 0;

        // Parse each fixture into a view model, which adds it to the array.
        $.each(fixtures, function (i, e) {
            // I don't think we can reliably only request fixtures relevant to loaded teams, so filter here.
            // Saw no team[1] in Autumn Nations Cup (ANC) 2020 where finals had the host decided but visitor TBC.
            if (!rankings[e.teams[0].id] || (e.teams[1] && !rankings[e.teams[1].id])) {
                return;
            };

            // WR started publishing rankings on match days during the world cup so discard matches that kicked off (ick) before then.
            if (e.time.millis < viewModel.originalMillis) {
                return;
            }

            addFixture(true, function (fixture) {
                fixture.homeId(e.teams[0].id);
                if (e.teams[1]) fixture.awayId(e.teams[1].id); // See ANC above
                fixture.noHome(false);
                fixture.switched(false);
                fixture.kickoff = $.formatDateTime('D dd/mm/yy hh:ii', new Date(e.time.millis));

                // Covid-TRC (noticed in 2021 but apparently also in 2020) ignores the stadium location
                // and treats the nominal home team as always at home
                var tournamentRespectsStadiumLocation = !e.events.some(function (event) {
                    return event.label.indexOf('Rugby Championship') > -1;
                });

                if (e.venue) {
                    fixture.venueName = [e.venue.name, e.venue.city, e.venue.country].join(', ');
                    anyQueries = true;
                    venueQueries++;
                    $.get('//cmsapi.pulselive.com/rugby/team/' + e.teams[0].id).done(function(teamData) {
                        if (e.venue.country !== teamData.teams[0].country) {
                            if (e.teams[1]) {
                                venueQueries++;
                                $.get('//cmsapi.pulselive.com/rugby/team/' + e.teams[1].id).done(function(teamData) {
                                    if (e.venue.country === teamData.teams[0].country) {
                                        // Saw this in the Pacific Nations Cup 2019 - a team was nominally Away
                                        // but in a home stadium. The seemed to get home nation advantage.
                                        if (tournamentRespectsStadiumLocation) {
                                            fixture.switched(true);
                                        }
                                    } else {
                                        if (tournamentRespectsStadiumLocation) {
                                            fixture.noHome(true);
                                        }
                                    }
                                }).always(function () {
                                    venueQueries--;
                                    if (venueQueries === 0) {
                                        viewModel.queryString.subscribe(function (qs) {
                                            history.replaceState(null, '', '?' + qs);
                                        });
                                    }
                                });
                            } else { // See ANC above
                                // Don't know who the second team is, but we do know the first team isn't at home.
                                if (tournamentRespectsStadiumLocation) {
                                    fixture.noHome(true);
                                }
                            }
                        }
                    }).always(function () {
                        venueQueries--;
                        if (venueQueries === 0) {
                            viewModel.queryString.subscribe(function (qs) {
                                history.replaceState(null, '', '?' + qs);
                            });
                        }
                    });
                }
                fixture.isRwc(e.events.length > 0 && e.events[0].rankingsWeight == 2);

                // If the match isn't unstarted (or doesn't not have live scores), add
                // the live score.
                // U is unstarted / no live score.
                // UP/CC are postponed/cancelled and also have no live score.
                // C is complete.
                // L1/LH/L2 are I believe the codes for 1st half, half time, 2nd half but I forgot.
                if (e.status !== 'U' && e.status !== 'UP' && e.status !== 'CC') {
                    fixture.homeScore(e.scores[0]);
                    fixture.awayScore(e.scores[1]);
                }
                switch (e.status) {
                    case 'U': fixture.liveScoreMode = 'Upcoming'; break;
                    case 'UP': fixture.liveScoreMode = 'Postponed'; break;
                    case 'CC': fixture.liveScoreMode = 'Cancelled'; break;
                    case 'C': fixture.liveScoreMode = 'Complete'; break;
                    case 'L1': fixture.liveScoreMode = 'First half'; break;
                    case 'L2': fixture.liveScoreMode = 'Second half'; break;
                    case 'LHT': fixture.liveScoreMode = 'Half time'; break;
                }
            });
        });

        // Once fixtures are loaded, show what effect they have on the rankings.
        viewModel.rankingsChoice('calculated');

        if (!anyQueries) {
            viewModel.queryString.subscribe(function (qs) {
                history.replaceState(null, '', '?' + qs);
            });
        }
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
