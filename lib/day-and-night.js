'use babel';

import { CompositeDisposable } from 'atom';
import request from 'request'
import _ from 'underscore-plus';
import MyConfig from './config-schema.json';
import { exec } from 'child_process';

// Global variables to be accessed and checked from functions
var daytime_themes, nighttime_themes, is_system_dark

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

  // Legacy, for debugging
  toggle() {
    _this.setup()
    _this.tick()
  },

  define_system_theme(){
    const command = "gsettings get org.gnome.desktop.interface color-scheme";

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`Command error: ${error.message}`);
            return;
        }

        if (stderr) {
            console.error(`Error: ${stderr}`);
            return;
        }

        const theme = stdout.trim();

        if (theme == 'prefer-dark') {
            is_system_dark = true;
        } else {
            is_system_dark = false;
        }

  },

  tick() {
    console.log("tick")
    // If the plugin has not been configured then exit, relies on user config
    if (!atom.config.get('day-and-night.Activation.configured')){
      return
    }

    // Do theme changing stuff
    current_themes = atom.config.get('core.themes')
    // Apparently copying the array
    themes = current_themes.slice()
    if (is_system_dark) {
      themes = nighttime_themes
    }
    else {
      themes = daytime_themes
    }

    // If there is a change to the themes, then update the config
    if (themes != current_themes){
      atom.config.set('core.themes', themes)
    }

  }

};
