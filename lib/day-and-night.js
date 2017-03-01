'use babel';

import { CompositeDisposable } from 'atom';
import request from 'request'
import SolarCalc from 'solar-calc'
import _ from 'underscore-plus';
import MyConfig from './config-schema.json';

// TODO: Listen for changes to the config and update themes

// Use raw API rather than navigator due to unavailability in Atom
const GEOLOCATION_API = 'https://maps.googleapis.com/maps/api/browserlocation/json?browser=chromium&sensor=true'

// Global variables to be accessed and checked from functions
var day, sunset, sunrise, daytime_themes, nighttime_themes, lat, lng
var cached_themes_ui = []
var cached_themes_syntax = []

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

    this.setup()

    // TODO: Allow user configurable refresh interval
    // TODO: Done, I think? Maybe check.
    interval = atom.config.get('day-and-night.Activation.interval')
    tock = setInterval(this.tick, interval * 60 * 1000)

    atom.themes.getLoadedThemes().forEach (theme => {
      if (theme.metadata.theme == 'ui') {
        cached_themes_ui.push(theme.name)
      } else if (theme.metadata.theme == 'syntax') {
        cached_themes_syntax.push(theme.name)
      }
    })

    // TODO: TESTING
    this.config.Appearance.properties.daytime_syntax_theme.enum =
      this.config.Appearance.properties.nighttime_syntax_theme.enum =
        syntaxThemesEnum
    this.config.Appearance.properties.daytime_ui_theme.enum =
      this.config.Appearance.properties.nighttime_ui_theme.enum =
        uiThemesEnum

    // Calculate the solar times
    this.sunTimes();

    // Events subscribed to in atom's system can be easily cleaned up with a CompositeDisposable
    this.subscriptions = new CompositeDisposable();

    // Register command that toggles
    this.subscriptions.add(atom.commands.add('atom-workspace', {
      'day-and-night:toggle': () => this.toggle()
    }));

    this.tick()

  },

  deactivate() {
    this.subscriptions.dispose();
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
    this.download(GEOLOCATION_API).then((html) => {
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
    console.log('MyPackage was toggled!')
    console.log('Sunrise is at: ' + sunrise)
    console.log('Sunset is at: ' + sunset)
    current_theme_names = atom.themes.getActiveThemeNames()
    console.log(current_theme_names)
    console.log(daytime_themes)
    console.log(nighttime_themes)

    this.tick()
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
      this.sunTimes()
    }

    // Do theme changing stuff
    current_themes = atom.config.get('core.themes')
    // Apparently copying the array
    themes = current_themes.slice()
    if (now >= sunset) {
      console.log("Night themes activated")
      themes = nighttime_themes
    }
    else if (now >= sunrise) {
      console.log("Daytime themes activated")
      themes = daytime_themes
    }

    // If there is a change to the themes, then update the config
    if (themes != current_themes){
      atom.config.set('core.themes', themes)
    }

  }

};
