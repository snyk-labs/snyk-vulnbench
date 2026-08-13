import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { ConnectedRouter } from 'connected-react-router';
import { Provider } from 'react-redux';
import App from './App';
import { APPLY_SHARED_DISPLAY, APPLY_SHARED_PREFERENCE } from '../constants/actionTypes';
import { getDisplayPreferences, getSharedPreferences } from '../utils/sharedPreferences';

export default class Root extends Component {
  componentDidMount() {
    const sharedPreferences = getSharedPreferences();
    const displayPreferences = getDisplayPreferences();

    this.props.store.dispatch({
      type: APPLY_SHARED_PREFERENCE,
      preferences: sharedPreferences.preferences
    });
    this.props.store.dispatch({
      type: APPLY_SHARED_DISPLAY,
      preferences: displayPreferences.preferences
    });
  }

  render() {
    const { store, history } = this.props;
    return (
      <Provider store={store}>
        <ConnectedRouter history={history}>
          <App />
        </ConnectedRouter>
      </Provider>
    );
  }
}

Root.propTypes = {
  store: PropTypes.object.isRequired,
  history: PropTypes.object.isRequired
};
