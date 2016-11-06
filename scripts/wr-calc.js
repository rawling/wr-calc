var teams = [];
var rankings = {};

var load = function(data) {
            teams = [];
            rankings = {};
            $.each(data.entries, function (i, e) {
                teams.push(e.team.name);
                rankings[e.team.name] = {};
                rankings[e.team.name].name = e.team.name;
                rankings[e.team.name].position = e.pos;
                rankings[e.team.name].ranking = e.pts;
            })
            $('#irbDate').text(data.effective.label);
            $('#standings').find('tr.ranking').remove();
            $.each(rankings, function (i, r) {
                $('#standings').append($('<tr class="ranking"><td>' + r.position + '</td><td>' + r.name + '</td><td>' + r.ranking.toFixed(2) + '</td><td></td></tr>'));
            });
            $('#right').css('margin-left', $('#left').width());
            $('#loading').hide();
            $('#left').show();
            $('#right').show();

            addFixture();
            addFixture();
            addFixture();
            addFixture();
            addFixture();
};

var addFixture = function () {
    var row = $('<tr class="fixture"><td><select class="homeTeam"><option /></select></td><td><input type="text" class="homeScore" size="3" /></td><td><input type="text" class="awayScore" size="3" /></td><td><select class="awayTeam"><option /></select></td><td><input type="checkbox" class="noHome" /></td><td><input type="checkbox" class="isRwc" /></td><td><button class="remove">x</button></td></tr>');
    $('#fixtures').append(row);
    var home = $(row).find('.homeTeam');
    var away = $(row).find('.awayTeam');
    var remove = $(row).find('.remove');
    $.each(teams, function (k, v) {
        $(home).append($('<option></option>').attr('value', v).text(v));
        $(away).append($('<option></option>').attr('value', v).text(v));
        $(home).combobox();
        $(away).combobox();
        $(remove).click(function() { $(this).parent().parent().detach(); });
    });
}

var calculate = function () {
    var newRankings = {};
    $.each(rankings, function (k, v) {
        var nr = {};
        nr.name = v.name;
        nr.oldPosition = v.position;
        nr.oldRanking = v.ranking;
        nr.newRanking = v.ranking;
        newRankings[v.name] = nr;
    });
    $.each($('#fixtures').find('tr.fixture'), function (k, v) {
        var row = $(v);
        var homeTeam = newRankings[row.find('select.homeTeam').val()];
        var awayTeam = newRankings[row.find('select.awayTeam').val()];
        var homeScore = parseInt(row.find('input.homeScore').val());
        var awayScore = parseInt(row.find('input.awayScore').val());
        var noHome = row.find('input.noHome').prop('checked');
        var isRwc = row.find('input.isRwc').prop('checked');
        if (typeof (homeTeam) != "undefined" &&
            typeof (awayTeam) != "undefined" &&
            homeTeam != awayTeam &&
            !isNaN(homeScore) &&
            !isNaN(awayScore)) {
            row.attr('style', 'background: #dfd;');
            var homeRanking = homeTeam.newRanking;
            if (!noHome) {
                homeRanking = homeRanking + 3;
            }
            var rankingDiff = homeRanking - awayTeam.newRanking;
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
            homeTeam.newRanking = homeTeam.newRanking + homeChange;
            awayTeam.newRanking = awayTeam.newRanking + awayChange;
        } else {
            row.attr('style', 'background: #fdd;');
        }
    });
    $('#standings').find('tr.ranking').remove();
    var sorted = [];
    $.each(newRankings, function (i, r) {
        sorted.push(r);
    });
    sorted.sort(function (a, b) { return b.newRanking - a.newRanking; });
    $.each(sorted, function (i, r) {
        var rankingDiff = r.newRanking - r.oldRanking;
        var rankingString = '';
        if (rankingDiff > 0) {
            rankingString = ' <span style="color: #090">(+' + (rankingDiff.toFixed(2)) + ')</span>';
        } else if (rankingDiff < 0) {
            rankingString = ' <span style="color: #900">(' + rankingDiff.toFixed(2) + ')</span>';
        }
        var positionDiff = i+1 - r.oldPosition;
        var positionString = '';
        if (positionDiff > 0) {
            positionString = '<span style="color: #900">&darr; (' + r.oldPosition + ')</span>';
        } else if (positionDiff < 0) {
            positionString = '<span style="color: #090">&uarr; (' + r.oldPosition + ')</span>';
        }
        $('#standings').append($('<tr class="ranking"><td>' + (i + 1) + '</td><td>' + positionString + '</td><td>' + r.name + '</td><td>' + r.newRanking.toFixed(2) + rankingString + '</td></tr>'));
    });
    $('#right').css('margin-left', $('#left').width());
}