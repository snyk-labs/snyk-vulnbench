import { combineReducers } from 'redux';
import fuelSavings from './fuelSavingsReducer';
import preferences from './preferencesReducer';
import displayPreferences from './displayPreferencesReducer';
import { connectRouter } from 'connected-react-router'

const rootReducer = history => combineReducers({
  router: connectRouter(history),
  fuelSavings,
  preferences,
  displayPreferences,
});

export default rootReducer;
