'use babel';

import { CompositeDisposable } from 'atom';
import request from 'request'
import SolarCalc from 'solar-calc'
import _ from 'underscore-plus';
import MyConfig from './config-schema.json';

// Use raw API rather than navigator due to unavailability in Atom
const GEOLOCATION_API = 'https://maps.googleapis.com/maps/api/browserlocation/json?browser=chromium&sensor=true'

// Global variables to be accessed and checked from functions
var day, sunset, sunrise, daytime_themes, nighttime_themes, lat, lng

// Attempting to resolve "this" issue
// suggestion implemented (roughly) from here:
// https://stackoverflow.com/questions/20279484/how-to-access-the-correct-this-context-inside-a-callback
var _this

// From https://github.com/qwtel/theme-flux-solar
// Get a human readable title for the given theme name.
function getThemeTitle(themeName = '') {
  const title = themeName.replace(/-(ui|syntax)/g, '').replace(/-theme$/g, '');
  return _.undasherize(_.uncamelcase(title));
}

function themeToConfigStringEnum({ metadata: { name } }) {
  return {
    value: name,
    description: getThemeTitle(name),
  };
}

// From https://github.com/as-cii/theme-flux/blob/master/lib/theme-flux.js
const loadedThemes = atom.themes.getLoadedThemes();

const uiThemesEnum = loadedThemes
  .filter(theme => theme.metadata.theme === 'ui')
  .map(themeToConfigStringEnum);

const syntaxThemesEnum = loadedThemes
  .filter(theme => theme.metadata.theme === 'syntax')
  .map(themeToConfigStringEnum);


export default {

  config: MyConfig,

  subscriptions: null,

  activate(state) {

    _this = this

    _this.setup()

    // TODO: Allow user configurable refresh interval
    // TODO: Done, I think? Maybe check.
    interval = atom.config.get('day-and-night.Activation.interval')
    tock = setInterval(_this.tick, interval * 60 * 1000)

    // Enumerate the theme options and set in config page
    _this.config.Appearance.properties.daytime_syntax_theme.enum =
      _this.config.Appearance.properties.nighttime_syntax_theme.enum =
        syntaxThemesEnum
    _this.config.Appearance.properties.daytime_ui_theme.enum =
      _this.config.Appearance.properties.nighttime_ui_theme.enum =
        uiThemesEnum

    console.log(uiThemesEnum)
    console.log(syntaxThemesEnum)

    // Calculate the solar times
    _this.sunTimes();

    // Events subscribed to in atom's system can be easily cleaned up with a CompositeDisposable
    _this.subscriptions = new CompositeDisposable();

    // Register command that toggles
    _this.subscriptions.add(atom.commands.add('atom-workspace', {
      'day-and-night:toggle': () => _this.toggle()
    }));

    _this.subscriptions.add(_this.subscribeToConfigChanges());

    _this.tick()

  },

  // From: https://github.com/Haacked/encourage-atom/blob/master/lib/encourage.js
  subscribeToConfigChanges() {
    const subscriptions = new CompositeDisposable();

    const appearanceObserver = atom.config.observe(
      'day-and-night.Appearance',
      (value) => {
        _this.setup()
        _this.tick()
      });
    subscriptions.add(appearanceObserver);

    const intervalObserver = atom.config.observe(
      'day-and-night.Activation.interval',
      (value) => {
        interval = atom.config.get('day-and-night.Activation.interval')
        clearInterval(tock)
        tock = setInterval(_this.tick, interval * 60 * 1000)
      });
    subscriptions.add(intervalObserver);

    return subscriptions;
  },

  deactivate() {
    _this.subscriptions.dispose();
  },

  download(url) {
    return new Promise((resolve, reject) => {
      request(url, (error, response, body) => {
        if (!error && response.statusCode == 200) {
          resolve(body)
        } else {
          reject({
            reason: 'Unable to download page'
          })
        }
      })
    })
  },

  //  Run general setup functions
  setup(){
    // Save the theme settings so aren't reloaded each time
    daytime_themes = [
      atom.config.get('day-and-night.Appearance.daytime_ui_theme'),
      atom.config.get('day-and-night.Appearance.daytime_syntax_theme')
    ]
    nighttime_themes = [
      atom.config.get('day-and-night.Appearance.nighttime_ui_theme'),
      atom.config.get('day-and-night.Appearance.nighttime_syntax_theme')
    ]
  },

  serialize(){
    return
  },

  // Get the sunrise and sunset times for today and user defined location
  sunTimes() {

    // Get the current date
    now = new Date()
    // Day is also saved and used to check if new solar times are needed
    day = now.getDate()

    // Get the GPS config coordinates from config as backup
    lat = atom.config.get('day-and-night.Location.latitude')
    lng = atom.config.get('day-and-night.Location.longitude')

    // Use Google geolocation API to determine sunrise and sunset
    _this.download(GEOLOCATION_API).then((html) => {
        json = JSON.parse(html);
        console.log(json)
        lat = json.location.lat
        lng = json.location.lng
        // If update is set in config then update the location config
        if (atom.config.get('day-and-night.Location.update')){
          console.log("Updating location config")
          atom.config.set('day-and-night.Location.latitude', lat)
          atom.config.set('day-and-night.Location.longitude', lng)
        }

        // Use the NPM solar-calc package to determine sunrise and sunset
        var solar = new SolarCalc(now,lat,lng);
        sunrise = solar.sunrise
        sunset = solar.sunset
      }).catch((error) => {
        // If there's an error then throw warning
        atom.notifications.addWarning(error.reason)
      })
  },

  // Legacy, for debugging
  toggle() {
    _this.setup()
    _this.tick()
  },

  tick() {
    console.log("tick")
    // If the plugin has not been configured then exit, relies on user config
    if (!atom.config.get('day-and-night.Activation.configured')){
      return
    }
    // Get the current date and time
    now = new Date()
    // Check if the day has changed since sun times last retrieved
    if (now.getDate() != day){
      console.log("Day changed!")
      _this.sunTimes()
    }

    // Do theme changing stuff
    current_themes = atom.config.get('core.themes')
    // Apparently copying the array
    themes = current_themes.slice()
    if (now >= sunset) {
      themes = nighttime_themes
    }
    else if (now >= sunrise) {
      themes = daytime_themes
    }

    // If there is a change to the themes, then update the config
    if (themes != current_themes){
      atom.config.set('core.themes', themes)
    }

  }

};
