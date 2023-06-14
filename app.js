import 'dotenv/config';
import express from 'express';
import {
  InteractionType,
  InteractionResponseType,
  InteractionResponseFlags,
  MessageComponentTypes,
  ButtonStyleTypes,
} from 'discord-interactions';
import { VerifyDiscordRequest, getRandomEmoji, DiscordRequest } from './utils.js';
import { getShuffledOptions, getResult } from './game.js';



// Create an express app
const app = express();
// Get port, or default to 3000
const PORT = process.env.PORT || 3000;
// Parse request body and verifies incoming requests using discord-interactions package
app.use(express.json({ verify: VerifyDiscordRequest(process.env.PUBLIC_KEY) }));

// Store for in-progress games. In production, you'd want to use a DB
const activeGames = {};

/**
 * Interactions endpoint URL where Discord will send HTTP requests
 */
app.post('/interactions', async function (req, res) {
  // Interaction type and data
  const { type, id, data } = req.body;

  /**
   * Handle verification requests
   */
  if (type === InteractionType.PING) {
    return res.send({ type: InteractionResponseType.PONG });
  }

  /**
   * Handle slash command requests
   * See https://discord.com/developers/docs/interactions/application-commands#slash-commands
   */
  if (type === InteractionType.APPLICATION_COMMAND) {
    const { name } = data;

    // "test" command
    if (name === 'test') {
      const userId = req.body.member.user.id;
      const game = {
        players: {},
        stockPrice: 0,
        waitingForPrice: true
      };
      activeGames[userId] = game;

      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: 'Click to start the simulation.',
          components: [{
            type: MessageComponentTypes.ACTION_ROW,
            components: [
              {
                type: 2,
                label: 'Start Sim',
                style: 1,
                custom_id: 'start_sim'
              }
            ]
          }]
        },
      });
    }
    
    // sim command
    if (name === 'sim' && id) {
      const userId = req.body.member.user.id;
      // User's object choice
      const objectName = req.body.data.options[0].value;

      // Create active game using message ID as the game ID
      activeGames[id] = {
          id: userId,
          objectName,
      };

      return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
          // Fetches a random emoji to send from a helper function
          content: `Rock papers scissors challenge from <@${userId}>`,
          components: [
          {
              type: MessageComponentTypes.ACTION_ROW,
              components: [
              {
                  type: MessageComponentTypes.BUTTON,
                  // Append the game ID to use later on
                  custom_id: `accept_button_${req.body.id}`,
                  label: 'Accept',
                  style: ButtonStyleTypes.PRIMARY,
              },
              ],
          },
          ],
      },
      });
    }
  }
  if (type === InteractionType.MESSAGE_COMPONENT) {
    // custom_id set in payload when sending message component
    const componentId = data.custom_id;

      if (componentId.startsWith('accept_button_')) {
        // get the associated game ID
        const gameId = componentId.replace('accept_button_', '');
        // Delete message with token in request body
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/${req.body.message.id}`;
        try {
          await res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              // Fetches a random emoji to send from a helper function
              content: 'What is your object of choice?',
              // Indicates it'll be an ephemeral message
              flags: InteractionResponseFlags.EPHEMERAL,
              components: [
                {
                  type: MessageComponentTypes.ACTION_ROW,
                  components: [
                    {
                      type: MessageComponentTypes.STRING_SELECT,
                      // Append game ID
                      custom_id: `select_choice_${gameId}`,
                      options: getShuffledOptions(),
                    },
                  ],
                },
              ],
            },
          });
          // Delete previous message
          await DiscordRequest(endpoint, { method: 'DELETE' });
        } catch (err) {
          console.error('Error sending message:', err);
        }
      } else if (componentId.startsWith('select_choice_')) {
        // get the associated game ID
        const gameId = componentId.replace('select_choice_', '');

        if (activeGames[gameId]) {
          // Get user ID and object choice for responding user
          const userId = req.body.member.user.id;
          const objectName = data.values[0];
          // Calculate result from helper function
          const resultStr = getResult(activeGames[gameId], {
            id: userId,
            objectName,
          });

          // Remove game from storage
          delete activeGames[gameId];
          // Update message with token in request body
          const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/${req.body.message.id}`;

          try {
            // Send results
            await res.send({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: { content: resultStr },
            });
            // Update ephemeral message
            await DiscordRequest(endpoint, {
              method: 'PATCH',
              body: {
                content: 'Nice choice ' + getRandomEmoji(),
                components: []
              }
            });
          } catch (err) {
            console.error('Error sending message:', err);
          }
        }
      }
    }
  
  if (type === InteractionType.MESSAGE_COMPONENT) {
    // for sim
    const componentId = data.custom_id;

    if (componentId.startsWith('start_sim')) {
      // get the associated game ID
        const gameId = componentId.replace('start_sim', '');
        // Delete message with token in request body
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/${req.body.message.id}`;
        try {
          await res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: 'Do you want to buy or sell?',
              // Indicates it'll be an ephemeral message
              flags: InteractionResponseFlags.EPHEMERAL,
              components: [
                {
                  type: MessageComponentTypes.ACTION_ROW,
                  components: [
                    {
                      type: MessageComponentTypes.BUTTON,
                      style: ButtonStyleTypes.PRIMARY,
                      label: 'Buy',
                      // Append game ID
                      custom_id: `buy_${gameId}`,
                    },
                    {
                      type: MessageComponentTypes.BUTTON,
                      style: ButtonStyleTypes.DANGER,
                      label: 'Sell',
                      // Append game ID
                      custom_id: `sell_${gameId}`,
                    },
                  ],
                },
              ],
            },
          });
          // Delete previous message
          await DiscordRequest(endpoint, { method: 'DELETE' });
          // await DiscordRequest(endpoint, { method: 'DELETE' });
        } catch (err) {
          console.error('Error sending message:', err);
        }
    
      const userId = req.body.member.user.id;
      const game = activeGames[userId];
      if (!game) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'No active simulation found.',
            flags: InteractionResponseFlags.EPHEMERAL,
          },
        });
      }
      
      game.waitingForPrice = true;

      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: 'Simulation started. Please enter the stock price.',
          components: [
            // buy and sell
            {
                type: 2,
                label: 'Join',
                style: 1,
                custom_id: 'button1'
              }
          ],
        },
      });
    }
  }
});    


app.listen(PORT, () => {
  console.log('Listening on port', PORT);
});
