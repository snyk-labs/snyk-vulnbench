import objectAssign from 'object-assign';
import { APPLY_SHARED_PREFERENCE } from '../constants/actionTypes';

const initialState = {
  dashboard: {},
  calculator: {}
};

export default function preferencesReducer(state = initialState, action) {
  if (action.type !== APPLY_SHARED_PREFERENCE) return state;

  return objectAssign({}, state, action.preferences);
}
