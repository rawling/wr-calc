// Overall view model for the page
var ViewModel = function (isFemale) {
    this.isFemale = isFemale;

    // The base rankings in an object, indexed by the ID of the team.
    this.rankingsById = ko.observable();

    // The base rankings in an array, ordered by points.
    this.baseRankings = ko.observable();

    // The date of the base rankings.
    this.originalDate = ko.observable();
    this.originalMillis = -1;

    // The teams from the base rankings, used to populate the lookup.
    // We only need this separate from baseRankings if we want to sort differently.
    this.teams = ko.observableArray();

    // The fixtures used to calculate projected rankings.
    this.fixtures = ko.observableArray();

    // A rate-limited set of fixtures. This allows us to add fixtures performantly, by having the fixture list
    // bound to fixtures above but calculations based on this version.
    // As long as no-one adds and completes a fixture within the time below, this should not be noticeable.
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

    // The rankings calculated by taking the original rankings and applying
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

    this.rwcPoolsChoice = ko.observable('original');
    this.rwcPools = ko.computed(function () {

        var sr = this.shownRankings();
        if (!sr || sr.length == 0) return null; // not ready yet

        // CBA to have made a lookup, just do scans to find by name
        function getTeam(name, seed, abbr) {
            var ranking = sr.find(function (r) { return r.team.name == name });
            if (ranking == null) return { name: name, abbr: abbr, pos: ''}; // in case it's e.g. 'Europe 1'
            return { name: ranking.team.name, abbr: ranking.team.abbreviation, pos: ranking.pos(), seed: seed };
        }

        // I doubt there's an API for this. Just hardcode the pools when they're drawn and take down after the RWC.
        var year;
        var rawData;

        if (this.isFemale) return null; // no draw yet
        if (new Date() < new Date('2023 Oct 29')) {
            year = 2023;
            rawData = [
            {
                pool: 'A',
                teams: [
                    getTeam('New Zealand', 2),
                    getTeam('France', 7),
                    getTeam('Italy', 12),
                    getTeam('Uruguay'),
                    getTeam('Namibia')
                ]
            },
            {
                pool: 'B',
                teams: [
                    getTeam('South Africa', 1),
                    getTeam('Ireland', 5),
                    getTeam('Scotland', 9),
                    getTeam('Tonga'),
                    getTeam('Romania')
                ]
            },
            {
                pool: 'C',
                teams: [
                    getTeam('Wales', 4),
                    getTeam('Australia', 6),
                    getTeam('Fiji', 11),
                    getTeam('Georgia'),
                    getTeam('Portugal')
                ]
            },
            {
                pool: 'D',
                teams: [
                    getTeam('England', 3),
                    getTeam('Japan', 8),
                    getTeam('Argentina', 10),
                    getTeam('Samoa'),
                    getTeam('Chile')
                ]
            }];
        }

        // try to map to "if they were drawn today"
        var seeded = rawData.map(function (p) { return p.teams.filter(function (t) { return t.seed > 0; }) }).flat();
        seeded.sort(function (a, b) { return a.seed - b.seed; });
        for (var i = 0; i < seeded.length; i++) {
            seeded[i].originalSeedOrder = i;
        }
        seeded.sort(function (a, b) { return a.pos - b.pos; });
        var seedOrderNowToTeam = {};
        for (var i = 0; i < seeded.length; i++) {
            seedOrderNowToTeam[i] = seeded[i];
        }

        var drawnToday = [];
        for (var i = 0; i < rawData.length; i++) {
            var redrawnPool = { pool: rawData[i].pool, teams: [] };
            for (var j = 0; j < rawData[i].teams.length; j++) {
                var team = rawData[i].teams[j];
                if (team.originalSeedOrder > -1) {
                    team = seedOrderNowToTeam[team.originalSeedOrder];
                }

                redrawnPool.teams.push(team);
            }
            drawnToday.push(redrawnPool);
        }

        return {
            year: year,
            withCurrentRankings: rawData,
            ifDrawnToday: drawnToday
        };
    }, this);
    this.shownRwcPools = ko.computed(function () {
        var data = this.rwcPools();
        if (!data) return null;
        switch (this.rwcPoolsChoice()) {
            case 'original':
                return data.withCurrentRankings;
            case 'redrawn':
                return data.ifDrawnToday;
            default:
                return null;
        }
    }, this);

    // A string representing the selected fixtures and results.
    this.fixturesString = ko.pureComputed({
        read: function () {
            return '2:' + $.map(this.fixtures(), function (e) {
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
            var versionAndString = value.split(':');
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
        return (this.isFemale ? 'w&' : '') + 'd=' + this.originalDate() + '&f=' + this.fixturesString();
    }, this);

    return this;
};
