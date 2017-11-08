# panorama
[![Build Status](https://travis-ci.org/wachunga/panorama.svg?branch=master)](https://travis-ci.org/wachunga/panorama)

Modern, modular software often involves lots of repositories. Keeping an eye on them can be difficult.

Here's how Panorama helps:
- reviewing commits* from everyone in your organization
- visualizing cross-repository changes
- the build broke, but which shared dependency changed?

\* Panorama also shows comments, pull requests, ...

## See it in action

![Panorama screenshot](https://cloud.githubusercontent.com/assets/438545/10493836/1c48a958-7268-11e5-9e92-7099e76f2052.png)

https://panorama.now.sh

## Development

 1. [Create a GitHub app](https://github.com/settings/applications/new) with authorization callback URL `http://localhost:3456/auth/github/callback`
 1. Set environment variables `GITHUB_APP_ID` and `GITHUB_APP_SECRET` to whatever GitHub provides.
 1. `npm install`
 1. `npm run build`
 1. `npm start`
