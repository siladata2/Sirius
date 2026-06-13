https://dashboard.heroku.com/new?template=https://github.com/Sila-Md/Sirius




# ✨ SIRIUS Multi-User WhatsApp Bot

[![Deploy to Heroku](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy?template=https://github.com/sirius-bot/sirius-md)

## 🚀 Features

- **Multi-User Support** - Each user gets their own bot instance
- **Web Panel** - Complete dashboard for managing your bot
- **Easy Pairing** - Pair your WhatsApp device in seconds
- **8-Character Password** - Simple login credentials
- **Admin Panel** - Manage all users and settings
- **Auto Join** - Auto-add users to community group
- **Anti-Spam & Anti-Link** - Protect your groups
- **Custom Commands** - Fully customizable

## 📦 Deployment

### Heroku (Recommended)
Click the deploy button above or:

```bash
heroku create your-app-name
heroku config:set SESSION_ID="SILA-MD~your-session"
heroku git:remote -a your-app-name
git push heroku main
heroku ps:scale worker=1 web=1
