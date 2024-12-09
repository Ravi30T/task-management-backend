const express = require('express')
const path = require('path')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3').verbose()
const cors = require('cors')

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express()
app.use(express.json())
app.use(cors())

const dbPath = path.join(__dirname, 'taskManagement.db')
let db = null

const createTables = async () => {
    try {
        // Creating 'user' table
        await db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                password TEXT NOT NULL
            );
        `);

        // Creating 'tasks' table
        await db.run(`
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                description TEXT,
                status TEXT,
                FOREIGN KEY(user_id) REFERENCES user(id) ON DELETE CASCADE
            );
        `);
    } catch (e) {
        console.error('Error creating tables:', e.message);
    }
};

const initializeDBAndServer = async () => {
    try{
        db = await open({
            filename: dbPath,
            driver: sqlite3.Database,
        })

        // Creating Tables
        await createTables()

        // Starting Server
        app.listen(3000, () => {
            console.log('Server running at Port: 3000')
        })
    }
    catch(e){
        console.log(`DB Error: ${e.message}`)
        process.exit(1)
    }
}

initializeDBAndServer()

// Middleware Function

const authenticateToken = (request, response, next) => {
    let jwtToken
  
    const authHeader = request.headers['authorization']
  
    if (authHeader !== undefined) {
      jwtToken = authHeader.split(' ')[1]
    }
  
    if (jwtToken === undefined) {
      response.status(401)
      response.send('Invalid JWT Token')
    } else {
      jwt.verify(jwtToken, 'MY_SECRET_TOKEN', async (error, payload) => {
        if (error) {
          response.status(401)
          response.send('Invalid JWT Token')
        } else {
          const username = payload.username
  
          request.username = username
  
          next()
        }
      })
    }
}


// API - 1 -- Register User

app.post('/api/auth/register', async (request, response) => {
    const {username, password} = request.body
    
    try {

        // Checking if user already registered or not

        const checkUserData = `SELECT * FROM users WHERE username = '${username}';`
        const getCheckedUserData = await db.get(checkUserData)
        
        if (getCheckedUserData === undefined) {
            if (password.length < 8) {
                response.status(400).send({message: 'Password is too short'})
            } else {
                const hashedPassword = await bcrypt.hash(password, 10)
                const createNewUser = `INSERT INTO users(username, password)
                VALUES(
                    '${username}',
                    '${hashedPassword}'
                );`
        
                await db.run(createNewUser)

                response.status(201).send({message: 'User created successfully'})
            }
        } else {
        response.status(400).send({message: 'User already exists'})
        }
    }
    catch(e){
        response.status(500).send({message: "Internal Server Error"})
    }
})


// API - 2 -- Login Existing User

app.post('/api/auth/login', async (request, response) => {
    const {username, password} = request.body
  
    // Check whether user is already registered or not
  
    const checkUser = `SELECT * FROM users WHERE username = '${username}';`
    const userDetails = await db.get(checkUser)

    if (userDetails !== undefined) {
      const validateUserPassword = await bcrypt.compare(
        password,
        userDetails.password,
      )
  
      if (validateUserPassword === true) {
        const payload = {
          username: username,
        }
  
        const jwtToken = jwt.sign(payload, 'MY_SECRET_TOKEN')
  
        response.send({jwtToken})
      } else {
        response.status(400)
  
        response.send({message: 'Invalid Password'})
      }
    } else {
      response.status(400)
      response.send({message: 'Invalid User'})
    }
})


// API - 3 -- Create New Task

app.post('/api/tasks', authenticateToken, async(request, response) => {
    const {username} = request
    const {title, description, status} = request.body

    try{
        const checkUser = `SELECT * FROM users WHERE username = '${username}';`
        const verifyUser = await db.get(checkUser)

        if(verifyUser !== undefined){
            const getUserId = `SELECT id FROM users WHERE username = '${username}';`
            const userId = await db.get(getUserId)

            const createNewTask = `INSERT INTO tasks(user_id, title, description, status)
            VALUES(
                '${userId.id}',
                '${title}',
                '${description}',
                '${status}'
            )`

            await db.run(createNewTask)
            response.status(201).send({message: "Task Created Successfully"})
        }
        else{
            response.status(400).send({message: "Invalid User Request"})
        }
    }
    catch(e){
        response.status(500).send({message: "Internal Server Error"})
    }
})


// API - 4 -- Update Task Status

app.put('/api/tasks/:id', authenticateToken, async(request, response) => {
    const {username} = request
    const {id} = request.params
    const {title, description,status} = request.body

    try{
        const checkUser = `SELECT * FROM users WHERE username = '${username}';`
        const userDetails = await db.get(checkUser)

        if(userDetails !== undefined){
            const getUserId = `SELECT id FROM users WHERE username = '${username}';`
            const userId = await db.get(getUserId)
            
            // To check whether the task belongs to the same user

            const checkUserTask = `SELECT * FROM tasks WHERE id = '${id}' AND user_id = '${userId.id}';`
            const verifyUserTask = await db.get(checkUserTask)
            
            if(verifyUserTask !== undefined){
                let updatedData = []

                if(title){
                    updatedData.push(`title = '${title}'`)
                }

                if(description){
                    updatedData.push(`description = '${description}'`)
                }

                if(status){
                    updatedData.push(`status = '${status}'`)
                }

                if(updatedData.length > 0){
                    const updateTask = `UPDATE tasks SET ${updatedData.join(', ')} WHERE id = '${id}' AND user_id = '${userId.id}';`
                    await db.run(updateTask)
                    response.status(201).send({message: "Task Updated Successfully"})
                }
            }
            else{
                response.status(400).send({message: "Invalid Task Details"})
            }
        }
        else{
            response.status(400).send({message: "Invalid User Request"})
        }
    }
    catch(e){
        response.status(500).send({message: "Internal Server Error"})
    }
})


// API - 5 -- Get All Tasks

app.get('/api/tasks', authenticateToken, async(request, response) => {
    const {username} = request
    const {status} = request.body

    try{
        const checkUser = `SELECT * FROM users WHERE username = '${username}';`
        const userDetails = await db.get(checkUser)

        if(userDetails !== undefined){
            const getUserId = `SELECT id FROM users WHERE username = '${username}';`
            const userId = await db.get(getUserId)
            
            let getTasks
            if (status) {
                getTasks = `SELECT * FROM tasks WHERE user_id = '${userId.id}' AND status = '${status}';`
            } else {
                getTasks = `SELECT * FROM tasks WHERE user_id = '${userId.id}';`
            }

            const allTasks = await db.all(getTasks)

            if(allTasks.length > 0){
                response.status(201).send(allTasks)
            }
            else{
                response.status(400).send({message: "No Tasks Available"})
            }
        }
        else{
            response.status(400).send({message: "Invalid User Request"})
        }
    }
    catch(e){
        response.status(400).send({message: "Internal Server Error"})
    }
})


// API - 6 -- Delete Task 

app.delete('/api/tasks/:id', authenticateToken, async(request, response) => {
    const {username} = request
    const {id} = request.params

    try{
        const checkUser = `SELECT * FROM users WHERE username = '${username}';`
        const userDetails = await db.get(checkUser)

        if(userDetails !== undefined){
            const getUserId = `SELECT id FROM users WHERE username = '${username}';`
            const userId = await db.get(getUserId)

            const getTask = `SELECT * FROM tasks WHERE user_id = '${userId.id}' AND id = '${id}';`
            const verifyTask = await db.get(getTask)

            if(verifyTask){
                const deleteTask = `DELETE FROM tasks WHERE id = '${id}';`
                await db.run(deleteTask)
                response.status(201).send({message: "Task Deleted Successfully"})
            }
            else{
                response.status(400).send({message: "Invalid Task Details"})
            }
        }
        else{
            response.status(400).send({message: "Invalid User Request"})
        }

    }   
    catch(e){
        response.status(500).send({message: "Internal Server Error"})
    }
})