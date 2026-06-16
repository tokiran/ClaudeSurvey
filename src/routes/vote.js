const express = require('express');
const router = express.Router();
const { client } = require('../db');

const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/:token', wrap(async (req, res) => {
  const result = await client.execute({
    sql: `SELECT p.*, s.question, s.status
          FROM participants p
          JOIN surveys s ON s.id = p.survey_id
          WHERE p.vote_token = ?`,
    args: [req.params.token],
  });
  const participant = result.rows[0];

  if (!participant) {
    return res.status(404).render('vote/message', {
      title: 'Link not found',
      message: 'This voting link is invalid or does not exist.',
    });
  }
  if (participant.responded) {
    return res.render('vote/message', {
      title: 'Already responded',
      message: 'You have already submitted your response. Thank you!',
    });
  }
  if (participant.status === 'closed') {
    return res.render('vote/message', {
      title: 'Survey closed',
      message: 'This survey is no longer accepting responses.',
    });
  }

  res.render('vote/vote', { question: participant.question, token: req.params.token });
}));

router.post('/:token', wrap(async (req, res) => {
  const result = await client.execute({
    sql: `SELECT p.*, s.status
          FROM participants p
          JOIN surveys s ON s.id = p.survey_id
          WHERE p.vote_token = ?`,
    args: [req.params.token],
  });
  const participant = result.rows[0];

  if (!participant) {
    return res.status(404).render('vote/message', {
      title: 'Link not found',
      message: 'This voting link is invalid or does not exist.',
    });
  }
  if (participant.responded) {
    return res.render('vote/message', {
      title: 'Already responded',
      message: 'You have already submitted your response. Thank you!',
    });
  }
  if (participant.status === 'closed') {
    return res.render('vote/message', {
      title: 'Survey closed',
      message: 'This survey is no longer accepting responses.',
    });
  }

  const response = req.body.response;
  if (response !== 'agree' && response !== 'disagree') {
    return res.status(400).render('vote/message', {
      title: 'Invalid response',
      message: 'Please choose Agree or Disagree.',
    });
  }

  await client.execute({
    sql: `UPDATE participants
          SET responded = 1, response = ?, responded_at = CURRENT_TIMESTAMP
          WHERE vote_token = ?`,
    args: [response, req.params.token],
  });

  res.render('vote/message', {
    title: 'Response recorded',
    message: `Thank you! Your response (${response === 'agree' ? 'Agree' : 'Disagree'}) has been recorded.`,
  });
}));

module.exports = router;
