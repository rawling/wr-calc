// Overall view model for the page
var ViewModel = function (source) {
    this.source = source; // mru or wru or event id - doesn't really matter, just goes back into the query
    this.event = ko.observable();
    this.rankingsSource = ko.observable(source); // in the footer link - should end up as mru or wru

    // The base rankings in an object, indexed by the ID of the team.
    this.rankingsById = ko.observable();

    // The base rankings in an array, ordered by points.
    this.baseRankings = ko.observable();

    // The date of the base rankings.
    this.originalDate = ko.observable();
    this.originalMillis = -1;
    this.originalDateIsEstimated = ko.observable(false);

    // The teams from the base rankings, used to populate the lookup.
    // We only need this separate from baseRankings if we want to sort differently.
    this.teams = ko.observableArray();

    // The fixtures used to calculate projected rankings.
    this.fixtures = ko.observableArray();

    // A rate-limited set of fixtures. This allows us to add fixtures performantly, by having the fixture list
    // bound to fixtures above but calculations based on this version.
    // As long as no-one ands and completes a fixture within the time below, this should not be noticeable.
    // (It also happens when we load in fixtures at startup, but that's a reasonable trade-off.)
    this.deferredFixtures = ko.computed(function () {
        return this.fixtures();
    }, this).extend({ rateLimit: 100 });

    // An indication of which set of rankings is displayed.
    // Options are null, 'original' or 'calculated'.
    this.rankingsChoice = ko.observable();

    // An indication of whether we have loaded fixtures from WR.
    // Not actually used yet, but could help show a loading screen.
    this.fixturesLoaded = ko.observable(false);

    // The rankings calcualted by taking the original rankings and applying
    // the fixtures.
    this.projectedRankings = ko.computed(function() {
        var rankingsById = this.rankingsById();
        var fixtures = this.deferredFixtures();

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
        var anyApplied = false;
        $.each(fixtures, function (index, fixture) {
            // If the fixture doesn't have teams selected, or is already applied, do nothing.
            if (!fixture.hasValidTeams() || fixture.alreadyInRankings) {
                return;
            }

            // Supply the current rankings to the fixture so it can calculate potential change.
            var home = projectedRankings[fixture.homeId()];
            var away = projectedRankings[fixture.awayId()];

            fixture.homeRankingBefore(home.pts());
            fixture.awayRankingBefore(away.pts());

            // If the fixture doesn't have scores as well as teams, don't apply it to the rankings.
            if (!fixture.isValid()) {
                return;
            }

            var possibleHomeChanges = fixture.changes();
            var homeChange = possibleHomeChanges[fixture.activeChange()];

            // The rankings are zero-sum, so the away team loses what the home team gains.
            var awayChange = -homeChange;

            // Update the "current" values.
            home.pts(home.pts() + homeChange);
            away.pts(away.pts() + awayChange);

            anyApplied = true;
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

        // If we have calculated rankings, make sure we are showing the calculated ones.
        if (anyApplied) {
            viewModel.rankingsChoice('calculated');
        }

        return sorted;
    }, this);

    // Whichever set of rankings is chosen.
    this.shownRankings = ko.computed(function () {
        switch (this.rankingsChoice()) {
            case 'original':
                return this.baseRankings();
            case 'calculated':
                return this.projectedRankings();
            default:
                return [];
        }
    }, this);

    this.poolChoice = ko.observable();
    this.pools = ko.computed(function() {
        if (!this.event()) return null; // never pools for the normal rankings views

        var fixtures = this.deferredFixtures();

        // Nothing to calculate if the data has not yet loaded.
        if (!fixtures) {
            return null;
        }

        var vm = this;

        // Apply each fixture in turn.
        var pools = {};
        var inProgPool = null;
        $.each(fixtures, function (index, fixture) {
            // If the fixture doesn't have teams selected, or is already applied, do nothing.
            if (!fixture.hasValidTeams()) {
                return;
            }

            var homeId = fixture.homeId();
            var awayId = fixture.awayId();

            // ensure the pools and teams exist
            var poolKey = fixture.pool() || 'NO POOL';
            if (!pools[poolKey]) {
                pools[poolKey] = {};
            }
            var pool = pools[poolKey];

            if (!pool[homeId]) {
                pool[homeId] = { team: homeId, name: vm.rankingsById()[homeId].team.name, played: 0, won: 0, drawn: 0, pts: 0, pf: 0, pa: 0, tf: 0, ta: 0, pv: {}, inProg: false };
            }
            var home = pool[homeId];
            if (!pool[awayId]) {
                pool[awayId] = { team: awayId, name: vm.rankingsById()[awayId].team.name, played: 0, won: 0, drawn: 0,pts: 0, pf: 0, pa: 0, tf: 0, ta: 0, pv: {}, inProg: false };
            }
            var away = pool[awayId];

            // If the fixture doesn't have scores as well as teams, don't apply it to the pool
            if (!fixture.isValid()) {
                return;
            }

            // parse ints here as sometimes we end up appending strings
            var homeScore = parseInt(fixture.homeScore());
            var awayScore = parseInt(fixture.awayScore());
            var homeTries = parseInt(fixture.homeTries() || 0);
            var awayTries = parseInt(fixture.awayTries() || 0);

            home.pf = home.pf + homeScore;
            away.pa = away.pa + homeScore;
            home.tf = home.tf + homeTries;
            away.ta = away.ta + homeTries;
            home.pa = home.pa + awayScore;
            away.pf = away.pf + awayScore;
            home.ta = home.ta + awayTries;
            away.tf = away.tf + awayTries;

            if (fixture.status == 'L1' || fixture.status == 'L2' || fixture.status == 'LHT') {
                home.inProg = true;
                away.inProg = true;
                inProgPool = poolKey;
            }

            home.played = home.played + 1;
            away.played = away.played + 1;

            var homeTablePoints = (homeScore > awayScore ? 4 : (homeScore == awayScore ? 2 : 0)) + (homeTries >= 4 ? 1 : 0) + ((homeScore < awayScore && homeScore + 7 >= awayScore) ? 1 : 0);
            home.pts = home.pts + homeTablePoints;

            var awayTablePoints = (homeScore < awayScore ? 4 : (homeScore == awayScore ? 2 : 0)) + (awayTries >= 4 ? 1 : 0) + ((homeScore > awayScore && homeScore <= awayScore + 7) ? 1 : 0);
            away.pts = away.pts + awayTablePoints;

            if (homeScore > awayScore) {
                home.won += 1;
            } else if (homeScore < awayScore) {
                away.won += 1;
            } else {
                home.drawn += 1;
                away.drawn += 1;
            }

            home.pv[awayId] = homeTablePoints;
            away.pv[homeId] = awayTablePoints;
        });

        // remove "undefined" if it looks like "knockouts at a world cup" but not if it looks like "all matches in a round robin"
        var poolKeys = Object.keys(pools);
        if (poolKeys.length > 1) {
            poolKeys = poolKeys.filter(function (k) { return k != 'NO POOL' });
        }
        poolKeys.sort();

        if (!this.poolChoice()) {
            this.poolChoice(inProgPool || poolKeys[0]);
        }

        return poolKeys.map(function (k) {
            return {
                pool: k,
                table: Object.values(pools[k]).sort(function (a, b) {
                    // admittedly, this is for RWC2023, and might be different for other tournaments
                    var c1 = b.pts - a.pts;
                    if (c1) return c1;

                    var c2 = b.pv[a.team] - a.pv[b.team];
                    if (c2) return c2;

                    var c3 = (b.pf - b.pa) - (a.pf - a.pa);
                    if (c3) return c3;
                    
                    var c4 = (b.tf - b.ta) - (a.tf - a.ta);
                    if (c4) return c4;

                    var c5 = b.pf - a.pf;
                    if (c5) return c5;

                    var c6 = b.tf - a.tf;
                    if (c6) return c6;

                    var c7 = vm.projectedRankings().find(r => r.team.id == b.team).pts() - vm.projectedRankings().find(r => r.team.id == a.team).pts();
                    return c7;
                })
            };
        });
    }, this);

    this.selectedPool = ko.computed(function () {
        var pools = this.pools();
        var poolChoice = this.poolChoice();
        if (!pools || !poolChoice || !pools.find(function (p) { return p.pool == poolChoice} )) return null;
        return pools.find(function (p) { return p.pool == poolChoice} );
    }, this);

    // Whichever set of rankings is chosen.
    this.shownRankings = ko.computed(function () {
        switch (this.rankingsChoice()) {
            case 'original':
                return this.baseRankings();
            case 'calculated':
                return this.projectedRankings();
            default:
                return [];
        }
    }, this);

    // A string representing the selected fixtures and results.
    this.fixturesString = ko.pureComputed({
        read: function () {
            return '2_' + $.map(this.fixtures(), function (e) {
                // In theory we should exclude matches that are already in the rankings, because otherwise we will include them a second time.
                // But in practice, when we ask for "today's" rankings, we will get the previous rankings, as "today's" rankings were posted after midnight.
                // These matches, played on top of the previous rankings, should reconstruct the same end result..
                //if (e.alreadyInRankings) return null;

                var t = (e.homeId() || e.awayId()) ? ('t' + (e.homeId() ?? '') + 'v' + (e.awayId() ?? '')) : '';
                var s = (!isNaN(e.homeScore()) || !isNaN(e.awayScore())) ? ('s' + (!isNaN(e.homeScore()) ? e.homeScore() : '') + '-' + (!isNaN(e.awayScore()) ? e.awayScore() : '')) : '';
                var f = (e.noHome() || e.isRwc() || e.switched()) ? ('f' + ((e.noHome() ? 1 : 0) + (e.isRwc() ? 2 : 0) + (e.switched() ? 4 : 0))) : '';

                return (t || s || f) ? (t + s + f) : null;
            }).join(';');
        },
        write: function (value) {
            var versionAndString = value.split(/[:_]/); // old was : but URLSearchParams %-encodes that so switched to underscore
            switch (versionAndString[0]) {
                case '1':
                    var fs = [];
                    var me = this;
                    $.each(versionAndString[1].split(';'), function (i, e) {
                        var rs = e.split(',');
                        var fixture = new FixtureViewModel(me);
                        fixture.homeId(rs[0]);
                        fixture.awayId(rs[1]);
                        fixture.homeScore(rs[2]);
                        fixture.awayScore(rs[3]);
                        fixture.noHome(rs[4]);
                        fixture.isRwc(rs[5]);
                        fixture.switched(false);
                        fs.push(fixture);
                    });
                    this.fixtures(fs);
                    break;
                case '2':
                    var fs = [];
                    var me = this;
                    $.each(versionAndString[1].split(';'), function (i, e) {
                        var m = e.match(/^(t(\d*)v(\d*))?(s(\d*)-(\d*))?(f(\d+))?$/);
                        if (!m) return;
                        var fixture = new FixtureViewModel(me);
                        if (m[1]) {
                            fixture.homeId(m[2]);
                            fixture.awayId(m[3]);
                        }
                        if (m[4]) {
                            fixture.homeScore(m[5]);
                            fixture.awayScore(m[6]);
                        }
                        if (m[7]) {
                            var flags = parseInt(m[8]);
                            fixture.noHome((flags & 1) == 1);
                            fixture.isRwc((flags & 2) == 2);
                            fixture.switched((flags & 4) == 4);
                        }
                        fs.push(fixture);
                    });
                    this.fixtures(fs);
                    break;
                default:
                    this.fixtures([]);
                    break;
            }
        },
        owner: this
    });

    // A string representing the base date and selected fixtures, suitable for putting into the address bar.
    this.queryString = ko.computed(function () {
        var params = { s: this.source, d: this.originalDate(), f: this.fixturesString() };
        var usp = new URLSearchParams(params);
        return usp.toString();
    }, this);

    this.showIsRwc = ko.observable(true);

    return this;
};
