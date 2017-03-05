// View model for a ranking entry.
// You can pass the raw data from the API call or an existing view model.
var RankingViewModel = function (rawRanking) {
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

    // HTML display of the previous position - show in colour and with a little arrow.
    this.previousPosDisplay = ko.computed(function () {
        var pos = this.pos();
        var previousPos = this.previousPos();
        if (pos < previousPos) {
            return '(&uarr;' + previousPos + ')';
        } else if (pos > previousPos) {
            return '(&darr;' + previousPos + ')';
        } else {
            return '<span style="visibility: hidden;" aria-hidden="true">(&rarr;' + previousPos + ')</span>';
        }
    }, this);

    // HTML display of the point change from the previous rankings - colour and +/-.
    this.ptsDiffDisplay = ko.computed(function () {
        var ptsDiff = this.pts() - this.previousPts();
        if (ptsDiff > 0) {
            return '(+' + ptsDiff.toFixed(2) + ')';
        } else if (ptsDiff < 0) {
            return '(-' + (-ptsDiff).toFixed(2) + ')';
        } else {
            return '<span style="visibility: hidden;" aria-hidden="true">(~' + ptsDiff.toFixed(2) + ')</span>';
        }
    }, this);
    
    this.changeCls = ko.computed(function () {
        var cls = 'ranking';

        var pos = this.pos();
        var previousPos = this.previousPos();
        if (pos < previousPos) {
            cls += ' posUp';
        } else if (pos > previousPos) {
            cls += ' posDown';
        }

        var ptsDiff = this.pts() - this.previousPts();
        if (ptsDiff > 0) {
            cls += ' ptsUp';
        } else if (ptsDiff < 0) {
            cls += ' ptsDown';
        }

        return cls;
    }, this);

    return this;
};