const util = require('../util');

function PullRequestEvent(event) {
	this.event = event;

	this.id = event.id;
	this.repo = event.repo.name;
	this.user = {
		login: event.actor.login,
		url: event.actor.url,
		image: event.actor.avatar_url
	};
	this.date = event.created_at;
	this.size = event.payload.pull_request.commits;
	this.branch = null;
}

PullRequestEvent.prototype.link = function () {
	// eg https://github.com/user/repo/pull/33
	return 'https://github.com/' + this.repo + '/pull/' + this.event.payload.number;
};

PullRequestEvent.prototype.linkLabel = function () {
	return 'new PR';
};

PullRequestEvent.prototype.message = function () {
	const action = this.event.payload.action;
	const title = this.event.payload.pull_request.title;
	return action + ' pull request:\n' + title;
};

PullRequestEvent.prototype.tooltip = function () {
	return util.makeTooltip.call(this);
};

PullRequestEvent.prototype.combine = function () {
	return false;
};

PullRequestEvent.prototype.icon = function () {
	return 'octicon-git-pull-request';
};

module.exports = PullRequestEvent;
