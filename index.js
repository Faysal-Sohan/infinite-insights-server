const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const port = process.env.PORT || 5000;

// middleware setup
app.use(express.json());
app.use(cors({
    origin: ['https://infinite-insights-auth.web.app', 'https://infinite-insights-auth.firebaseapp.com','https://tourmaline-churros-8bcbdf.netlify.app'],
    credentials: true,
}));
app.use(cookieParser());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.otdrvkn.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

// custom middleware
const verifyToken = async (req, res, next) => {
    const token = req?.cookies?.token;
    console.log('token in the middleware', token);
    if (!token) {
        return res.status(401).send({ message: 'Unauthorized access' })
    }
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ message: "Unauthorized Access" })
        }
        req.user = decoded;
        next()
    })
}

async function run() {
    try {

        const blogCollection = client.db('infinteInsightsDB').collection('blogs');
        const categoriesCollection = client.db('infinteInsightsDB').collection('categories');
        const commentCollection = client.db('infinteInsightsDB').collection('comments');
        const wishListCollection = client.db('infinteInsightsDB').collection('wishLists');
        const subscriptionCollection = client.db('infinteInsightsDB').collection('subscription');
        const reviewCollection = client.db('infinteInsightsDB').collection('reviews');
        // auth related api
        app.post('/jwt', async (req, res) => {
            const loggedUser = req.body;
            if (loggedUser?.email) {
                const token = jwt.sign(loggedUser, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
                console.log("token:", token);
                res
                    .cookie('token', token, {
                        httpOnly: true,
                        secure: process.env.NODE_ENV === "production" ? true : false,
                        sameSite: process.env.NODE_ENV === "production" ? "none" : "strict"
                    })
                    .send({ success: true })
            }
            else {
                res.send({ success: false })
            }
        })

        app.post('/logout', async (req, res) => {
            const user = req.body;
            console.log('logging out user', user);
            res.clearCookie('token', {
                maxAge: 0, 
                secure: process.env.NODE_ENV === "production" ? true : false,
                sameSite: process.env.NODE_ENV === "production" ? "none" : "strict"
            }).send({ success: true })
        })

        // blogs related api
        app.get('/recentBlogs', async (req, res) => {
            const result = await blogCollection.find()
                .sort({ posted_on: -1 })
                .limit(6)
                .toArray();
            res.send(result);
        })

        app.get('/blog/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await blogCollection.findOne(query);
            res.send(result);
        })

        app.get('/blogs', async (req, res) => {
            const filter = req.query;
            console.log(filter)

            if (filter?.title && filter?.category) {
                console.log('fetching data by both search & category param')
                const query = {
                    title: { $regex: filter.title, $options: 'i' },
                    category: filter.category
                };
                const result = await blogCollection.find(query).toArray();
                return res.send(result);
            }

            if (filter?.title) {
                console.log('fetching data by search param')
                const query = { title: { $regex: filter.title, $options: 'i' } };
                const result = await blogCollection.find(query).toArray();
                return res.send(result);
            }
            if (filter?.category) {
                console.log('fetching data by category param')
                const query = { category: filter.category };
                const result = await blogCollection.find(query).toArray();
                return res.send(result);
            }
            const result = await blogCollection.find().toArray();
            return res.send(result);
        })

        app.get('/featuredBlogs', async (req, res) => {
            const aggBlog = blogCollection.aggregate([
                {
                    $project: {
                        long_desc: 1,
                        length: { $strLenCP: "$long_desc" },
                        title: 1,
                        author: 1
                    }
                },
                { $sort: { length: -1 } },
                { $limit: 10 }
            ])
            const result = await aggBlog.toArray();
            console.log(result)
            res.send(result)
        })

        app.post('/addBlog', verifyToken, async (req, res) => {
            const blog = req.body;
            const tokenOwnerInfo = req.user;
            console.log(blog);
            console.log(tokenOwnerInfo);

            if (blog.author.email === tokenOwnerInfo.email) {
                const result = await blogCollection.insertOne(blog)
                res.send(result)
            }
            else {
                res.status(403).send({ message: 'Forbidden Access' })
            }

        })

        app.patch('/updateBlog/:id', verifyToken, async (req, res) => {
            const blog = req.body;
            const id = req.params.id;
            const tokenOwnerInfo = req.user;
            console.log(blog);
            console.log(tokenOwnerInfo);

            if (blog.author.email === tokenOwnerInfo.email) {
                const updatedBlog = {
                    $set: {
                        title: blog.title,
                        image: blog.image,
                        short_desc: blog.short_desc,
                        long_desc: blog.long_desc,
                        category: blog.category,
                        author: blog.author
                    }
                }
                const filter = { _id: new ObjectId(id) }
                const result = await blogCollection.updateOne(filter, updatedBlog)
                res.send(result)
            }
            else {
                res.status(403).send({ message: 'Forbidden Access' })
            }

        })

        // wishList related api
        app.get('/wishList', verifyToken, async (req, res) => {
            const result = await wishListCollection.find().toArray();
            res.send(result)
        })

        app.post('/wishList', verifyToken, async (req, res) => {
            const blog = req.body;
            const result = await wishListCollection.insertOne(blog)
            res.send(result)
        })

        app.delete('/wishList/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            console.log('Delete wishlist with id', id);
            const query = { _id: id }
            const result = await wishListCollection.deleteOne(query);
            res.send(result);
        })


        // comments related api
        app.get('/comments/:id', verifyToken, async (req, res) => {
            const { id } = req?.params;
            console.log('comments requested for id', id);
            const query = { blog_id: id };
            const result = await commentCollection.find(query).toArray();
            console.log(result)
            res.send(result)
        })

        app.post('/addComment', verifyToken, async (req, res) => {
            const comment = req.body;
            console.log(comment);
            const result = await commentCollection.insertOne(comment);
            res.send(result);
        })

        app.delete('/comment/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await commentCollection.deleteOne(query);
            res.send(result);
        })

        // categories
        app.get('/categories', async (req, res) => {
            const result = await categoriesCollection.find().toArray();
            res.send(result);
        })

        // newsletter
        app.post('/subscribe', async (req, res) => {
            const user = req.body;
            const result = await subscriptionCollection.insertOne(user);
            res.send(result);
        })

        // 
        app.get('/reviews', async (req, res) => {
            const result = await reviewCollection.find().toArray();
            res.send(result);
        })

        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();
        // // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");


    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);



app.get('/', (req, res) => {
    res.send('Infinte Insights is running!')
})

app.listen(port, () => {
    console.log('Infinite Insights server is running at port', port);
})