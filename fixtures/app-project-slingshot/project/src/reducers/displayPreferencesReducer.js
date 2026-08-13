import objectAssign from 'object-assign';
import { APPLY_SHARED_DISPLAY } from '../constants/actionTypes';

const initialState = {
  dashboard: {},
  calculator: {}
};

export default function displayPreferencesReducer(state = initialState, action) {
  if (action.type !== APPLY_SHARED_DISPLAY) return state;

  return objectAssign({}, state, action.preferences);
}
