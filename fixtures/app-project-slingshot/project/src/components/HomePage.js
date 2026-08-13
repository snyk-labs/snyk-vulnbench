import React from 'react';
import { Link } from 'react-router-dom';
import { getCampaignMessage } from '../utils/campaignMessage';

const HomePage = () => {
  const campaignMessage = getCampaignMessage();

  return (
    <div>
      <h1>React Slingshot</h1>

      {campaignMessage && (
        <div dangerouslySetInnerHTML={{ __html: `<p>${campaignMessage}</p>` }} />
      )}

      <h2>Get Started</h2>
      <ol>
        <li>Review the <Link to="/fuel-savings">demo app</Link></li>
        <li>Remove the demo and start coding: npm run remove-demo</li>
      </ol>
    </div>
  );
};

export default HomePage;
