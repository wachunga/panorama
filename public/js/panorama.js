'use strict';

const _ = require('underscore');
const moment = require('moment');
const ko = require('knockout');
const reqwest = require('reqwest');

const svg = require('./svg');
const colors = require('./colors');
const PushEvent = require('./event/pushEvent');
const BranchEvent = require('./event/branchEvent');
const CommentEvent = require('./event/commentEvent');
const PullRequestEvent = require('./event/pullRequestEvent');
const TagEvent = require('./event/tagEvent');

function Panorama(organizations) {
	this.organizations = ko.observableArray(organizations);
	this.organization = ko.observable(_.first(organizations));
	this.view = ko.observable('list');
	this.loading = ko.observable(false);
	this.error = ko.observable();
	this.pushes = ko.observableArray();
	this.filter = ko.observable();

	this.organizationInput = ko.computed({
		read: function () {
			var org = this.organization();
			return org && org.login;
		},
		write: function (str) {
			var view = this.view();
			if (str) {
				history.pushState(null, null, '/' + view + '?organization=' + str);
				this.organization({login: str});
			} else {
				history.pushState(null, null, '/' + view);
				this.organization(null);
			}
		},
		owner: this
	});

	var underlay = {};
	this.adjustAllLanes = _.debounce(function () {
		var element = document.getElementById('underlay');
		if (element !== underlay.element) {
			underlay = { element: element, svg: svg.make(element) };
		}
		svg.drawLanes(underlay.svg);
	}, 100);
	this.repos = ko.computed({
		read: function() {
			var org = this.organization();
			function simpleName(name) {
				if (org && name.indexOf(org.login) === 0) {
					return name.substr(org.login.length + 1);
				}
				return name;
			}

			var index = 0;
			return _.sortBy(_.map(_.groupBy(this.pushes(), function (push) {
				return push.repo;
			}), function (pushes, repo) {
				return {
					name: repo,
					simpleName: simpleName(repo),
					pushes: pushes,
					color: colors[index++ % colors.length]
				};
			}), function (repo) {
				return repo.name;
			});
		},
		owner: this,
		deferEvaluation: true
	});
	this.filteredPushes = ko.computed({
		read: function() {
			var filter = this.filter();
			if (!filter) {
				return this.pushes();
			} else {
				return ko.utils.arrayFilter(this.pushes(), filter);
			}
		},
		owner: this,
		deferEvaluation: true
	});
	this.buckets = ko.computed({
		read: function () {
			var pushes = this.pushes();
			var bucketEnd;
			var bucketIndex = 0;
			var bucketSizeIndex = 0;
			var bucketSize = [{ minutes: 15 }, { hours: 1 }, { hours: 4 }];
			var buckets = [];

			function bucketer(date) {
				if (bucketEnd == null) {
					bucketEnd = moment(date).clone().startOf('minute');
					bucketEnd.minutes(15 * Math.floor(bucketEnd.minutes() / 15));
					bucketEnd.subtract(bucketSize[0]);
					buckets.push({ time: bucketEnd.clone(), label: bucketEnd.fromNow() });
				}
				if (bucketEnd.isBefore(date)) {
					return bucketIndex;
				}
				while (true) {
					bucketSizeIndex++;
					bucketEnd.subtract(bucketSize[Math.floor(bucketSizeIndex / 12)] || { days: 1 });
					if (bucketEnd.isBefore(date)) {
						buckets.push({ time: bucketEnd.clone(), label: bucketEnd.fromNow() });
						return ++bucketIndex;
					}
				}
			}

			pushes.forEach(function (push) {
				push.bucket = bucketer(push.date);
			});

			return buckets;
		},
		owner: this,
		deferEvaluation: true
	});
	this.bucketLabels = ko.computed({
		read: function () {
			var labels = _.pluck(this.buckets(), 'label');
			labels.unshift('');
			labels.pop();

			var seenLabel = {};
			return labels.map(function (label) {
				var firstSeen = !seenLabel[label];
				seenLabel[label] = true;
				return {
					label: label,
					first: firstSeen
				};
			});
		},
		owner: this,
		deferEvaluation: true
	});
	this.bucketedPushesByRepo = ko.computed({
		read: function () {
			var buckets = this.buckets();
			var repos = this.repos();

			return repos.map(function (repo) {
				var result = [];
				while (result.length < buckets.length) {
					result.push({
						bucket: result.length,
						bucketClass: 'bucket-' + result.length + ' bucket-color-' + result.length % colors.length,
						pushes: []
					});
				}
				var compressed = compressPushes(repo.pushes);
				compressed.forEach(function (push) {
					if (push.bucket < result.length) {
						result[push.bucket].pushes.push(push);
					} // else buckets are stale
				});
				return {
					repo: repo,
					buckets: result
				};
			});
		},
		owner: this,
		deferEvaluation: true
	});
}

Panorama.prototype.switchView = function () {
	var next = { list: 'lanes', lanes: 'list' };
	this.view(next[this.view()]);
};
Panorama.prototype.getRepository = function (repoName) {
	var repo = _.findWhere(this.repos(), {name: repoName});
	return repo || {name: '', simpleName: '', color: 'black'};
};
Panorama.prototype.formatTimeAgo = function (time) {
	return moment(time).fromNow();
};
Panorama.prototype.getPushTime = function (push) {
	return this.formatTimeAgo(push.date);
};
Panorama.prototype.setFilter = function (type, value) {
	var state = '/list';
	var org = this.organization();
	if (org) {
		state += '?organization=' + org.login;
	}
	if (type == 'repo' && value) {
		history.pushState(null, null, state + '&repo=' + value);
		this.filter(function (push) { return push.repo === value; });
	} else if (type == 'user' && value) {
		history.pushState(null, null, state + '&user=' + value);
		this.filter(function (push) { return push.user.login === value; });
	} else {
		history.pushState(null, null, state);
		this.filter(null);
	}
	this.view('list');
};
Panorama.prototype.applyWindowLocation = function () {
	this.view(window.location.pathname.substring(1));
	var search = parseLocationSearch();

	if (search && search.organization) {
		this.organization({ login: search.organization });
	}

	// TODO: could make these additive, but is that intuitive?
	if (search && search.user) {
		this.filter(function (push) { return push.user.login === search.user; });
	} else if (search && search.repo) {
		this.filter(function (push) { return push.repo === search.repo; });
	} else {
		this.filter();
	}
};
Panorama.prototype.init = function () {
	this.applyWindowLocation();
	window.onpopstate = this.applyWindowLocation.bind(this);

	fetchPushes(this);
	this.organization.subscribe(fetchPushes.bind(null, this));

	this.view.subscribe(function (view) {
		var pathname = '/' + view;
		if (window.location.pathname.indexOf(pathname) !== 0) {
			var org = this.organization();
			if (org) {
				pathname += '?organization=' + org.login;
			}
			history.pushState(null, null, pathname);
		}
	}, this);

	ko.applyBindings(this);
};

function parseLocationSearch() {
	if (!location.search) {
		return {};
	}
	var map = {};
	var parsed = location.search.substring(1);
	var pairs = parsed.split('&');
	pairs.forEach(function (pair) {
		var split = pair.split('=');
		map[split[0]] = split[1];
	});
	return map;
}

function fetchPushes(viewModel) {
	viewModel.pushes([]);
	viewModel.error(null);
	viewModel.loading(true);

	var org = viewModel.organization();
	var url = org == null ? './a/user/events' : './a/organization/' + org.login + '/events';

	// TODO: ditch request and just use fetch
	reqwest({
		url: url,
		type: 'json'
	}).then(function (response) {
		var pushes = response.map(processGithubEvent).filter(Boolean);
		viewModel.pushes(pushes);
		viewModel.loading(false);
	}).fail(function (err) {
		console.error(err);
		viewModel.loading(false);
		viewModel.error('couldn\'t fetch fetch activity for ' + (org.login || 'unknown'));
	});
}

function processGithubEvent(event) {
	// see https://developer.github.com/v3/activity/events/types/
	if (event.type === 'PushEvent') {
		return new PushEvent(event);
	} else if (event.type === 'CommitCommentEvent') {
		return new CommentEvent(event);
	} else if (event.type === 'PullRequestEvent') {
		return new PullRequestEvent(event);
	} else if (event.type === 'CreateEvent') {
		if (event.payload.ref_type === 'tag') {
			return new TagEvent(event);
		} else if (event.payload.ref_type === 'branch') {
			return new BranchEvent(event);
		}
		// repository create - do nothing
	} else {
		// IssueCommentEvent - too noisy (automated CI)
		// PullRequestReviewCommentEvent - better to view these on the PR page
		// console.log(event.type)
	}
}

function compressPushes(pushes) {
	var compressed = [];
	pushes.forEach(function (push) {
		var last = _.last(compressed);
		var together = last && last.combine(push);
		if (together) {
			compressed.pop();
			compressed.push(together);
		} else {
			compressed.push(push);
		}
	});
	return compressed;
}

window.Panorama = Panorama;
