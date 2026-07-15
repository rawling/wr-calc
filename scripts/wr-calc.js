// Read parameters before we do any binding as it may remove them.
// Parameters live in the hash (the app is entirely client-side, so the server
// never needs them), but the query string is still accepted for older links;
// hash wins if both are present.
var usp = new URLSearchParams(location.search);
new URLSearchParams(location.hash.replace(/^#/, '')).forEach(function (value, key) {
    usp.set(key, value);
});

// If we arrived via a legacy query-string link, normalise the address bar to
// the hash form so only # URLs are ever shown or copied from here on.
if (location.search) {
    history.replaceState(null, '', location.pathname + '#' + usp.toString());
}

// The app only reads its parameters at startup, so reload when the hash changes
// (e.g. via the MRU/WRU links). history.replaceState doesn't fire this event,
// so our own address bar updates don't cause reloads.
window.addEventListener('hashchange', function () { location.reload(); });

var dateString = usp.get('d');
var fixturesString = usp.get('f');

var sourceString = usp.has('w') ? 'wru' : usp.get('s'); // support ?w for older links
if (!sourceString) {
    sourceString = 'mru';
}

// Create the view model and bind it to the HTML.
var viewModel = new ViewModel(sourceString);
ko.applyBindings(viewModel);

// Fetch JSON, rejecting on HTTP errors (like jQuery's $.get did).
// Also counts in-flight requests so the UI can show a loading indicator.
var getJSON = function (url) {
    viewModel.pendingRequests(viewModel.pendingRequests() + 1);
    var done = function () {
        viewModel.pendingRequests(viewModel.pendingRequests() - 1);
    };
    var promise = fetch(url).then(function (response) {
        if (!response.ok) {
            throw new Error('HTTP ' + response.status + ' for ' + url);
        }
        return response.json();
    });
    promise.then(done, done);
    return promise;
};

// Load rankings from World Rugby.
var loadRankings = function (rankingsSource, startDate, fixtures, event) {
    viewModel.rankingsSource(rankingsSource);
    getJSON('https://api.wr-rims-prod.pulselive.com/rugby/v3/rankings/' + rankingsSource + (startDate ? ('?date=' + startDate) : '')).then(function (data) {
        var rankings = {};
        data.entries.forEach(function (e) {
            var maxLength = 15;
            e.team.displayName = e.team.name.length > maxLength ? e.team.abbreviation : e.team.name;
            e.team.displayTitle = e.team.name.length > maxLength ? e.team.name : null;

            viewModel.teams.push(e.team);
            rankings[e.team.id] = new RankingViewModel(e);
        });
        viewModel.rankingsById(rankings);

        if (event) {
            // Restrict selectable teams to those in the event
            var eventTeamIds = {};
            fixtures.forEach(function (e) {
                if (e.teams[0] && e.teams[0].id != '0') eventTeamIds[e.teams[0].id] = true;
                if (e.teams[1] && e.teams[1].id != '0') eventTeamIds[e.teams[1].id] = true;
            });
            viewModel.teams.remove(function (t) { return !eventTeamIds[t.id]});
        }

        var sorted = Object.values(rankings);
        sorted.sort(function (a, b) { return b.pts() - a.pts(); });

        viewModel.baseRankings(sorted);
        viewModel.originalDate(data.effective.label);
        viewModel.originalMillis = data.effective.millis;
        viewModel.rankingsChoice('original');

        // There's a bug with historical MRU rankings where their effective date is set after the requested date (2020-09-21).
        // The effective date should never be in the future by more than a day, so we should be able to detect this and guess a date instead.
        // (It could be a little bit in the future because we ask for midnight but the rankings are published during the day.)
        ////var requestedStartDateMillis = new Date(startDate).getTime();
        ////if (viewModel.originalMillis > requestedStartDateMillis + (24 * 60 * 60 * 1000)) {
        // In fact ignore the millis and just compare the "label" as it's lexicographical and as it's just the date it should never be in the future.
        if (data.effective.label > startDate) {
            viewModel.originalDate(startDate);
            viewModel.originalMillis = new Date(startDate).getTime();
            viewModel.originalDateIsEstimated(true);
        }

        // When we're done, load fixtures in.
        if (fixturesString) {
            viewModel.fixturesString(fixturesString);
            viewModel.rankingsChoice('calculated');
            viewModel.queryString.subscribe(function (qs) {
                history.replaceState(null, '', location.pathname + '#' + qs);
            });
        } else {
            // This should be parallelisable if we have our observables set up properly. (Fixture validity depends on teams.)
            if (fixtures) {
                fixturesLoaded(fixtures, rankings, event);
            } else {
                addFixture();
                loadFixtures(rankings, !!dateString);
            }
        }
    });
};


// Parse a /match/{id}/summary response into what the fixture detail panel shows.
var parseMatchDetail = function (data) {
    var teams = (data.teams || []).map(function (t) {
        var list = (t.teamList && t.teamList.list) || [];
        var players = list.map(function (e) {
            return {
                number: e.number || '',
                name: (e.player && e.player.name && e.player.name.display) || '',
                position: e.positionLabel || e.position || '',
                firstReplacement: false
            };
        });
        // The API list arrives in no useful order; show 1-15 then 16-23.
        players.sort(function (a, b) {
            return (parseInt(a.number, 10) || 99) - (parseInt(b.number, 10) || 99);
        });
        // Mark where the bench starts so the UI can draw a divider.
        for (var i = 0; i < players.length; i++) {
            if ((parseInt(players[i].number, 10) || 0) >= 16) {
                players[i].firstReplacement = true;
                break;
            }
        }
        return {
            name: (t.team && t.team.name) || t.name || '',
            players: players
        };
    });
    var officials = (data.officials || []).map(function (o) {
        var name = (o.official && o.official.name && o.official.name.display) || '';
        var country = (o.official && o.official.country) || '';
        return {
            role: o.position || 'Official',
            display: name + (country ? ' (' + country + ')' : '')
        };
    });
    return { error: false, teams: teams, officials: officials };
};

// Format a kickoff time for display; produces the same output as the old
// jquery.formatDateTime 'D dd/mm/yy hh:ii' format.
var formatKickoff = function (date) {
    var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return days[date.getDay()] + ' ' + pad(date.getDate()) + '/' + pad(date.getMonth() + 1) + '/' + date.getFullYear() + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
};

// Format a date for the fixture or rankings API call.
var formatDate = function(date) {
    var d     = new Date(date),
        month = '' + (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1),
        day   = '' + (d.getDate() < 10 ? '0' : '') + d.getDate(),
        year  = d.getFullYear();

    return [year, month, day].join('-');
}

// Load the events for the picker dropdown. Pass currentEvent ({ id, label })
// when already viewing an event, so it shows as the dropdown's selection
// (added to the list if it isn't among this year's events).
var loadEvents = function(sport, currentEvent) {
    viewModel.eventsCaption(sport.toUpperCase() + ' Event');
    var start = new Date(new Date(new Date().getFullYear(), 0, 1));
    var end = new Date(new Date(new Date().getFullYear(), 12, 13));
    getJSON('https://api.wr-rims-prod.pulselive.com/rugby/v3/event/?startDate=' + formatDate(start) + '&endDate=' + formatDate(end) + '&sport=' + sport + '&pageSize=50').then(function (data) {
        var events = [];
        for (var i = 0; i < data.content.length; i++) {
            var event = data.content[i];

            // Don't show the whole year
            if (event.label.match(/^\d{4} .*en's International$/)) continue;

            // Collect WXV
            if (event.label.match(/^WXV/)) {
                var id = event.id + ':' + event.label;
                var label = event.label;
                while (i + 1 < data.content.length && data.content[i + 1].label.match(/^WXV/)) {
                    i++;
                    id += "," + data.content[i].id + ':' + data.content[i].label;
                    label += '/' + data.content[i].label;
                }
                events.push({ id: id, label: label });
            } else {
                events.push({ id: event.id, label: event.label });
            }
        }

        var current = null;
        if (currentEvent) {
            current = events.filter(function (e) { return e.id === currentEvent.id; })[0];
            if (!current) {
                // e.g. an event from a previous year - show it at the top.
                current = currentEvent;
                events.unshift(current);
            }
        }

        viewModel.events(events);
        if (current) {
            viewModel.selectedEvent(current);
        }
    })
}

if (sourceString == 'mru' || sourceString == 'wru') {
    loadRankings(sourceString, dateString)
    loadEvents(sourceString)
} else {
    viewModel.event(sourceString);
    // load the event(s)!
    var eventIds = sourceString.split(',').map(function (idAndName) { return idAndName.split(':')[0]; });

    if (eventIds.length == 1) {
        // Special-case a single event so we can use its real label for the title.
        getJSON('https://api.wr-rims-prod.pulselive.com/rugby/v3/event/' + sourceString + '/schedule?language=en').then(function (data) {

            var events = {};
            viewModel.eventName(data.event.label);
            document.title = 'WRRC - ' + data.event.label;
            loadEvents(data.event.sport, { id: sourceString, label: data.event.label });
            events[data.event.id] = { event: data.event };
            loadRankings(
                data.event.sport,
                data.event.start.label,// maybe subtract a day so we don't include rankings on that date?
                data.matches,
                events
            );
        });
    } else {
        // Load all the events, and aggregate them into one big collection of matches.
        var eventNames = sourceString.split(',').map(function (idAndName) { return idAndName.split(':')[1]; });
        viewModel.eventName(eventNames.join('/'));
        document.title = 'WRRC - ' + eventNames.join('/');
        var promises = eventIds.map(function (eventId) {
            return getJSON('https://api.wr-rims-prod.pulselive.com/rugby/v3/event/' + eventId + '/schedule?language=en');
        });

        Promise.all(promises).then(function (datas) {
            var sport = datas[0].event.sport;
            loadEvents(sport, { id: sourceString, label: eventNames.join('/') });
            var start = datas.reduce(function (prev, curr) { return prev.event.start.label < curr.event.start.label ? prev : curr }).event.start.label;
            var matches = datas.map(function (data) { return data.matches; }).flat();
            matches.sort(function (a, b) { return a.time.millis - b.time.millis; });

            var events = {};
            datas.forEach (function (data, indx) {
                events[data.event.id] = { event: data.event, name: eventNames[indx] };
            });
            loadRankings(
                sport,
                start, // maybe subtract a day so we don't include rankings on that date?
                matches,
                events
            );
        });
    }
}

// Helper to add a fixture to the top/bottom.
// If we had up/down buttons we could maybe get rid of this.
var addFixture = function (top, process) {
    var fixture = new FixtureViewModel(viewModel);
    fixture.noHome(true);
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
    var url = "https://api.wr-rims-prod.pulselive.com/rugby/v3/match?startDate="+from+"&endDate="+to+"&sort=asc&pageSize=100&page=";
    var getFixtures = function (fixtures, page, then) {
        getJSON(url + page).then(function(data) {
            if (data.content.length == 100) {
                getFixtures(fixtures.concat(data.content), page + 1, then);
            } else {
                then(fixtures.concat(data.content), rankings);
            }
        });
    };

    getFixtures([], 0, fixturesLoaded);
}

var fixturesLoaded = function (fixtures, rankings, event) {
    // N.B. since we add to the top, these get reversed, so reverse the order here!
    fixtures.reverse();

    // We make extra AJAX requests for any fixture with a venue in the hope of working out
    // if the home team has advantage.
    // Keep track of those here, so we can check when all queries are finished and subscribe
    // to the query string then.
    var teamQueries = {};
    var pendingTeamQueries = 0;
    function queryTeam(id) {
        var query = teamQueries[id];
        if (!query) {
            query = queryTeamCountryViaCache(id);
            teamQueries[id] = query;
        }
        return query;
    }

    // when we ask for "a team" we only want its country. cache that propery here but map it out to "the team object" with just the field we want
    function queryTeamCountryViaCache(id) {
        var cacheKey = 'api/v3/team/' + id + '|country';
        if (localStorage[cacheKey]) {
            return Promise.resolve({ country: localStorage[cacheKey] });
        }
        pendingTeamQueries++;
        var settled = function () { pendingTeamQueries--; };
        var promise = getJSON('https://api.wr-rims-prod.pulselive.com/rugby/v3/team/' + id).then(function (team) {
            return team.country;
        });
        promise.then(settled, settled);

        promise.then(function (country) {
            localStorage[cacheKey] = country;
        }).catch(function () {});

        return promise.then(function (country) { return { country: country }; });
    }

    // if we're dealing with an event, also query to see if a team got a TBP?
    // in this case we ignore the counts about as we're going to disable the query string stuff anyway.
    function queryTries(id, cache) {
        function getTriesForId(id) {
            return getJSON('https://api.wr-rims-prod.pulselive.com/rugby/v3/match/' + id + '/stats').then(function (stats) {
                return [stats.teamStats[0].stats.Tries, stats.teamStats[1].stats.Tries];
            });
        }

        // In progress so neither query nor populate cache.
        if (!cache) {
            return getTriesForId(id);
        }

        // Finished, so check cache, and populate if we load it.
        var cacheKey = 'api/v3/match/' + id + '/stats|teamStats[x].stats.Tries';
        if (localStorage[cacheKey]) {
            return Promise.resolve(JSON.parse(localStorage[cacheKey]));
        }
        var promise = getTriesForId(id);
        if (cache) {
            promise.then(function (stats) {
                localStorage[cacheKey] = JSON.stringify(stats);
            }).catch(function () {});
        }
        return promise;
    }

    // Parse each fixture into a view model, which adds it to the array.
    var allRwc = true;
    var allNotRwc = true;
    var endOfHome = new Date(2026, 6, 1); // WR stopped applying home advantage.
    fixtures.forEach(function (e) {
        // I don't think we can reliably only request fixtures relevant to loaded teams, so filter here.
        
        // If we're not querying an event, we're querying a sport; don't include fixtures that don't match
        if (!event && e.sport.toUpperCase() != sourceString.toUpperCase()) {
            return;
        }

        if (event) {
            // For knockouts where a team may not be decided yet, allow team to be null or id to be 0
            if ((e.teams[0] && (e.teams[0].id != '0') && !rankings[e.teams[0].id]) || (e.teams[1] && (e.teams[1].id != '0') && !rankings[e.teams[1].id])) {
                if (event) {
                    console.warn('Not including fixture ' + e.teams[0].name + ' vs ' + e.teams[1].name + ' as a team is missing from the rankings');
                }
                return;
            };
        } else {
            // If we're not looking at an event, don't include such matches.
            // People might have to insert a row for an upcoming final.
            // But we were getting matches for non-International tournaments and no easy way to tell that is the case.
            if (!e.teams[0] || !rankings[e.teams[0].id] || !e.teams[1] || !rankings[e.teams[1].id]) {
                return;
            };
        }

        addFixture(true, function (fixture) {
            fixture.homeId(e.teams[0].id);
            if (e.teams[1]) fixture.awayId(e.teams[1].id); // See ANC above

            var kickoff = new Date(e.time.millis);
            var afterEndOfHome = kickoff > endOfHome;
            fixture.noHome(afterEndOfHome);
            fixture.switched(false);
            fixture.kickoff = formatKickoff(kickoff);

            // Covid-TRC (noticed in 2021 but apparently also in 2020) ignores the stadium location
            // and treats the nominal home team as always at home
            var tournamentRespectsStadiumLocation = !e.events.some(function (event) {
                return event.label.match(/^The Rugby Championship 202[01]$/);
            });

            if (e.venue) {
                fixture.venueNameAndCountry = [e.venue.name, e.venue.country].join(', ');
                fixture.venueCity = e.venue.city;
                queryTeam(e.teams[0].id).then(function(homeTeamData) {
                    if (e.venue.country !== homeTeamData.country && !(e.venue.country == 'Northern Ireland' && homeTeamData.country == 'Ireland')) {
                        if (e.teams[1]) {
                            queryTeam(e.teams[1].id).then(function(awayTeamData) {
                                if (e.venue.country === awayTeamData.country && !(e.venue.country == 'Northern Ireland' && awayTeamData.country == 'Ireland')) {
                                    // Saw this in the Pacific Nations Cup 2019 - a team was nominally Away
                                    // but in a home stadium. They seemed to get home nation advantage.
                                    if (tournamentRespectsStadiumLocation) {
                                        fixture.switched(true);
                                    }
                                } else {
                                    if (tournamentRespectsStadiumLocation) {
                                        fixture.noHome(true);
                                    }
                                }
                            }).catch(function () {});
                        } else { // See ANC above
                            // Don't know who the second team is, but we do know the first team isn't at home.
                            if (tournamentRespectsStadiumLocation) {
                                fixture.noHome(true);
                            }
                        }
                    }
                }).catch(function () {});
            }
            var isRwc = (event && event.rankingsWeight == 2) || (e.events.length > 0 && e.events[0].rankingsWeight == 2) || (!!e.competition.match(/Rugby World Cup/) && !e.competition.match(/Qualifying/));
            fixture.isRwc(isRwc);
            if (isRwc) {
                allNotRwc = false;
            } else {
                allRwc=  false;
            }

            if (event) {
                function shortenPhase(name) {
                    return name && name.replace(/[a-z]+-final/, 'F').replace('Runner-up P', '2nd P').replace('Runner-up S', 'Loser S');
                }
                fixture.eventPhase = shortenPhase(e.eventPhase);
                if (e.teams[0].id == '0' && e.teams[0].name) {
                    fixture.homeCaption = shortenPhase(e.teams[0].name);
                }
                if (e.teams[1].id == '0' && e.teams[1].name) {
                    fixture.awayCaption = shortenPhase(e.teams[1].name);
                }
            }

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
            fixture.status = e.status;
            fixture.matchId = e.matchId;
            switch (e.status) {
                case 'U': {
                    // Try to detect if a match should have started by now, and just hasn't been reported by WR.
                    // Give it a bit of leeway.
                    var leeway = 5 * 60 * 1000; // 5 minutes
                    if (e.time.millis + leeway > new Date()) {
                        fixture.liveScoreMode = 'Upcoming';
                    } else {
                        fixture.liveScoreMode = 'Unreported';
                    }
                    break;
                }
                case 'UP': fixture.liveScoreMode = 'Postponed'; break;
                case 'CC': fixture.liveScoreMode = 'Cancelled'; break;
                case 'C': {
                    fixture.liveScoreMode = 'Complete';
                    // WR started publishing rankings on match days during the world cup.
                    // Try to work out if the match is already included in the rankings.
                    // We know it is "complete" because we're in that case.
                    // Try to ensure it ended before the ranking timestamp.
                    // (If we used the start time here we would block events that were in progress when
                    // the rankings were published, which obviously can't have been in the rankings.)
                    // This will incorrectly exclude a match that has completed, if WR published rankings
                    // 90 minutes after it started that didn't include the result.
                    // This will incorrectly include a match that is not marked as complete but is included
                    // in the rankings, or that finished and was included in the rankings less than 90
                    // minutes after it kicked off.
                    var kickoffMillis = e.time.millis;
                    var endMillis = kickoffMillis + 90 * 60 * 1000;
                    if (endMillis < viewModel.originalMillis) {
                        fixture.alreadyInRankings = true;
                    }
                    break;
                }
                case 'L1': fixture.liveScoreMode = 'First half'; break;
                case 'L2': fixture.liveScoreMode = 'Second half'; break;
                case 'LHT': fixture.liveScoreMode = 'Half time'; break;
            }

            // For in-progress matches, show the match clock too.
            if ((e.status === 'L1' || e.status === 'L2' || e.status === 'LHT') && e.clock && e.clock.label) {
                fixture.liveScoreMode += ' · ' + e.clock.label;
            }

            if (event) {
                // Tries matter if this is the "pool" stage of a large tournament, or
                // (assume) if the tournament doesn't have more than one phase
                if ((e.eventPhaseId && e.eventPhaseId.type == 'Pool') || !e.eventPhaseId) {
                    fixture.triesMatter(true); 
                    if (e.eventPhaseId) {
                        // If we have multiple events, give each fixture its event as the pool
                        if (Object.keys(event).length > 1) {
                            fixture.pool(event[e.events[0].id].name);
                            fixture.eventPhase = event[e.events[0].id].name;
                        } else {
                            fixture.pool(e.eventPhaseId.subType);
                        }
                    }
                    if (e.status != 'U') {
                        queryTries(e.matchId, e.status == 'C').then(function (tries) {
                            fixture.homeTries(tries[0] || 0);
                            fixture.awayTries(tries[1] || 0);
                        }).catch(function () {});
                    }
                }
            }
        });
    });

    // listen until all queries are done - be aware that some queries trigger more queries so we can't just "wait all"
    if (!event) {
        var i = setInterval(function() {
            if (pendingTeamQueries === 0) {
                viewModel.queryString.subscribe(function (qs) {
                    history.replaceState(null, '', location.pathname + '#' + qs);
                });
                clearInterval(i);
            }
        }, 1000);
    }

    if ((allRwc || allNotRwc) && event) {
        viewModel.showIsRwc(false);
    }
};

// Add days to a date.
Date.prototype.addDays = function (d) {
    if (d) {
        var t = this.getTime();
        t = t + (d * 86400000);
        this.setTime(t);
    }
    return this;
};

// Taken from SO https://stackoverflow.com/questions/30043773/knockout-input-readonly-state/30101073#30101073
// User Yvan https://stackoverflow.com/users/3738129/yvan
// Adjusted to add disabled attrbute, not enabled
ko.bindingHandlers.disabled = {
    update: function (element, valueAccessor) {
        if (ko.utils.unwrapObservable(valueAccessor())) {
            element.setAttribute('disabled', true);
        } else {
            element.removeAttribute('disabled');
        }
    }
};
ko.bindingHandlers.title = {
    update: function (element, valueAccessor) {
        var value = ko.utils.unwrapObservable(valueAccessor());
        if (value) {
            element.setAttribute('title', value);
        } else {
            element.removeAttribute('title');
        }
    }
}
