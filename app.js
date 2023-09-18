const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initilizeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, (request, response) => {
      console.log("Server is running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`Db Error ${e.message}`);
  }
};

initilizeDbAndServer();

// API 1 POST
//user reqistration

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const isUsernameAvailableSqlQuery = `SELECT * FROM user
  WHERE 
  username = '${username}';`;
  const isUsernameAvailable = await db.get(isUsernameAvailableSqlQuery);
  console.log(isUsernameAvailable);
  if (isUsernameAvailable === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const addUserQuery = `INSERT INTO user (username,password,name,gender)
      VALUES
      ('${username}','${hashedPassword}','${name}','${gender}');`;

      const dbResponse = await db.run(addUserQuery);

      response.send("User created successfully");
      response.status(400);
      console.log(dbResponse);
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//API 2 POST
//user login
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectedUerQuery = `SELECT * FROM user
  WHERE 
  username = '${username}';`;

  const isUserPresent = await db.get(selectedUerQuery);
  if (isUserPresent !== undefined) {
    // if user is present in db
    const getPasswordInDbQuery = `SELECT password FROM user
     WHERE 
     username = '${username}';`;
    const passwordInDb = await db.get(getPasswordInDbQuery);

    const isPasswordMatched = await bcrypt.compare(
      password,
      passwordInDb.password
    );
    console.log(isPasswordMatched + " " + "password");
    if (isPasswordMatched === true) {
      // password matched
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MST");
      response.send({ jwtToken: jwtToken });
    } else {
      // password not matched
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    // user invalid
    response.status(400);
    response.send("Invalid user");
  }

  // END
});

// authenticate

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
    // console.log(jwtToken);
    if (jwtToken === undefined) {
      response.status(401);
      response.send("Invalid JWT Token");
    } else {
      jwt.verify(jwtToken, "MST", async (error, payload) => {
        if (error) {
          response.status(401);
          response.send("Invalid JWT Token");
        } else {
          request.username = payload.username;
          next();
        }
      });
    }
  } else {
    response.status(401);
    response.send("Invalid JWT Token");
  }
  // END
};

// API 3
// GET user feed

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  console.log("login success");
  const username = request.username;
  console.log(username);
  const getUserIdQuery = `SELECT user_id FROM user
  WHERE
  username = '${username}';`;
  const userId = await db.get(getUserIdQuery);

  const getFeedQuery = `SELECT username,tweet,date_time AS dateTime FROM 
  tweet INNER JOIN follower ON
  follower.following_user_id = tweet.user_id NATURAL JOIN user

  WHERE 
  follower.follower_user_id = ${userId.user_id}
  ORDER BY 
  date_time DESC
  LIMIT 4;`;
  const userFeed = await db.all(getFeedQuery);
  response.send(userFeed);
});

// API 4 GET /user/following/

const getUserId = async (username) => {
  const getUserIdQuery = `SELECT user_id FROM user
  WHERE
  username = '${username}';`;
  const userId = await db.get(getUserIdQuery);
  return userId.user_id;
};

app.get("/user/following/", authenticateToken, async (request, response) => {
  const username = request.username;
  const userId = await getUserId(username);
  const getUserFollowingQuery = `SELECT name FROM 
  follower INNER JOIN user ON follower.following_user_id =user.user_id
  WHERE 
  follower.follower_user_id = ${userId};`;

  const userFollowing = await db.all(getUserFollowingQuery);
  response.send(userFollowing);
});

// API 5 GET user followers

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const username = request.username;
  const userId = await getUserId(username);
  const getUserFollowersQuery = `SELECT name FROM 
  user INNER JOIN follower ON follower.follower_user_id = user.user_id
  WHERE
  following_user_id = ${userId};`;
  const userFollowers = await db.all(getUserFollowersQuery);
  response.send(userFollowers);
});

// API 6 user tweets

const checkUserFollowingStatus = async (userId, tweetId) => {
  const isUserFollowingQuery = `SELECT *  FROM 
    tweet INNER JOIN follower ON follower.following_user_id = tweet.user_id
    WHERE 
    follower_user_id = ${userId} AND tweet.tweet_id = ${tweetId};`;

  const userFollowingArray = await db.all(isUserFollowingQuery);
  if (userFollowingArray !== undefined) {
    return userFollowingArray;
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
};

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const tweetId = request.params.tweetId;
  const username = request.username;
  const userId = await getUserId(username);
  const userFollowingArray = await checkUserFollowingStatus(userId, tweetId);
  //   console.log(userFollowingArray);
  if (userFollowingArray.length !== 0) {
    const requestTweetQuery = `SELECT tweet,
    COUNT(DISTINCT(like.like_id)) AS likes,
    COUNT(DISTINCT(reply.reply_id)) AS replies,
    date_time AS dateTime
     FROM 
      tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id INNER JOIN
      reply ON reply.tweet_id = tweet.tweet_id 
      WHERE
      tweet.tweet_id = ${tweetId};`;
    const tweetDetails = await db.get(requestTweetQuery);
    response.send(tweetDetails);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//API 7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const tweetId = request.params.tweetId;
    const username = request.username;
    const userId = await getUserId(username);

    const userFollowingArray = await checkUserFollowingStatus(userId, tweetId);
    console.log(userFollowingArray);
    if (userFollowingArray.length !== 0) {
      const getTweetLikedUsersQuery = `SELECT username
        FROM user INNER JOIN like ON user.user_id = like.user_id
        WHERE 
        like.tweet_id = ${tweetId};`;

      const likedUsers = await db.all(getTweetLikedUsersQuery);
      const likedUserNamesArray = likedUsers.map((each) => each.username);
      response.send({ likes: likedUserNamesArray });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API 8

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const tweetId = request.params.tweetId;
    console.log(tweetId);

    const username = request.username;
    const userId = await getUserId(username);
    const userFollowingStatusArray = await checkUserFollowingStatus(
      userId,
      tweetId
    );
    if (userFollowingStatusArray.length !== 0) {
      const getTweetRepliesQuery = `SELECT name,reply FROM
         reply INNER JOIN tweet ON tweet.tweet_id = reply.tweet_id 
         INNER JOIN user ON user.user_id = reply.user_id
         WHERE 
         tweet.tweet_id = ${tweetId};`;
      const tweetRepliesArray = await db.all(getTweetRepliesQuery);
      response.send({ replies: tweetRepliesArray });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

// API 9 /user/tweets/

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const username = request.username;
  const userId = await getUserId(username);
  console.log(userId);
  //   const getUserTweets = `SELECT tweet,COUNT(like.user_id) AS likes,
  //   COUNT(reply.user_id) AS replies,date_time AS dateTime
  //   FROM
  //   tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id INNER JOIN
  //   reply ON tweet.tweet_id = reply.tweet_id

  //   WHERE
  //   tweet.user_id = ${userId};
  //   GROUP BY
  //   tweet.tweet_id;`;
  const getUserTweets = `SELECT tweet,COUNT(DISTINCT(like.like_id)) AS likes,
  COUNT(DISTINCT(reply.reply_id)) AS replies,
  tweet.date_time AS dateTime 
  FROM
   user INNER JOIN tweet ON user.user_id = tweet.user_id INNER JOIN like ON
   like.tweet_id = tweet.tweet_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
   WHERE
   user.user_id = ${userId}
   GROUP BY
   tweet.tweet_id;`;

  const userTweetsArray = await db.all(getUserTweets);
  response.send(userTweetsArray);
});

// API 10 tweet

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const username = request.username;
  const userId = await getUserId(username);
  const { tweet } = request.body;
  const dateTime = new Date().toJSON().substring(0, 19).replace("T", " ");
  const tweetATweetQuery = `INSERT INTO tweet(tweet,user_id,date_time)
  VALUES
 ('${tweet}',${userId},'${dateTime}');`;
  const tweeting = await db.run(tweetATweetQuery);
  response.send("Created a Tweet");
  console.log(tweeting);
});

// DELETE A TWEET

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const tweetId = request.params.tweetId;
    const username = request.username;
    const userId = await getUserId(username);

    const getTweetDetailsQuery = `SELECT * FROM
    tweet WHERE tweet.tweet_id = ${tweetId} AND tweet.user_id = ${userId};`;
    const tweetDetailsArray = await db.all(getTweetDetailsQuery);

    if (tweetDetailsArray.length !== 0) {
      const deleteTweetQuery = `DELETE FROM
        tweet WHERE
        tweet.tweet_id = ${tweetId} AND tweet.user_id = ${userId};`;
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
