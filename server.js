//1. Hämta alla verktyg jag behöver
import express from "express"; // Express är motorn i min webbserver
import dotenv from "dotenv"; // Dotenv läser hemligheter från .env-filen (ex. lösenord)
import Database from "better-sqlite3"; // Verkty för att prata med databasen

// Load environment variables into process.env
dotenv.config();

// Create the server app
const app = express();

// Decide which port the server will run on
const PORT = process.env.PORT ?? 3000;

// MIDDLEWARE

app.use(express.json());
// Converts incoming JSON into a usable JavaScript object (req.body)

const logger = (req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  // Logs every incoming request (useful for debugging)

  next();
  // VERY !important! passes control to next middleware/route
};

app.use(logger);

// Database setup
const db = new Database("./data/movies.db");
// Opens the database file or creates it if it does not exist

db.exec(`
  CREATE TABLE IF NOT EXISTS movies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    year INTEGER NOT NULL,
    genre TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    movie_id INTEGER NOT NULL,
    author TEXT NOT NULL,
    rating INTEGER NOT NULL,
    comment TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (movie_id) REFERENCES movies(id)
  );
`);
// Creates the tables if they do not already exist

// Prepared statements

const getMovieById = db.prepare("SELECT * FROM movies WHERE id = ?");
// Get one movie by id

const insertMovie = db.prepare(
  "INSERT INTO movies (title, year, genre) VALUES (?, ?, ?)",
);
// Insert a new movie

const deleteMovie = db.prepare("DELETE FROM movies WHERE id = ?");
// Delete movie by id

const getReviewsByMovieId = db.prepare(`
  SELECT * FROM reviews
  WHERE movie_id = ?
  ORDER BY id ASC
`);
// Get all reviews for one movie in stable order

const getReviewById = db.prepare("SELECT * FROM reviews WHERE id = ?");
// Get one review by id

const insertReview = db.prepare(
  "INSERT INTO reviews (movie_id, author, rating, comment) VALUES (?, ?, ?, ?)",
);
// Insert a new review

const updateMovie = db.prepare(
  "UPDATE movies SET title = ?, year = ?, genre = ? WHERE id = ?",
);
// Update movie by id

const deleteReviewsByMovieId = db.prepare(
  "DELETE FROM reviews WHERE movie_id = ?",
);
// Delete all reviews for one movie

const getAllMoviesWithReviewCount = db.prepare(`
  SELECT movies.*, COUNT(reviews.id) AS review_count
  FROM movies
  LEFT JOIN reviews ON reviews.movie_id = movies.id
  GROUP BY movies.id
  ORDER BY movies.id ASC
`);
// Get all movies with review count in stable order

const getMoviesByGenreWithReviewCount = db.prepare(`
  SELECT movies.*, COUNT(reviews.id) AS review_count
  FROM movies
  LEFT JOIN reviews ON reviews.movie_id = movies.id
  WHERE movies.genre = ?
  GROUP BY movies.id
  ORDER BY movies.id ASC
`);
// Get movies by genre with review count in stable order

const getMovieByIdWithReviewCount = db.prepare(`
  SELECT movies.*, COUNT(reviews.id) AS review_count
  FROM movies
  LEFT JOIN reviews ON reviews.movie_id = movies.id
  WHERE movies.id = ?
  GROUP BY movies.id
`);
// Get one movie by id with review count

// ROUTES // ROUTES // ROUTES // ROUTES // ROUTES // ROUTES // ROUTES //

// ====================
// MOVIE ROUTES
// ====================

// GET /api/movies

app.get("/api/movies", (req, res) => {
  const genre =
    typeof req.query.genre === "string" ? req.query.genre.trim() : undefined;
  // Read optional genre filter and normalize input

  if (genre === "") {
    return res.status(400).json({
      error: "genre cannot be empty",
    });
  }
  // Reject empty genre like ?genre=

  if (genre) {
    const movies = getMoviesByGenreWithReviewCount.all(genre);
    return res.json(movies);
  }
  // Return only movies in the selected genre

  const movies = getAllMoviesWithReviewCount.all();
  res.json(movies);
  // Return all movies with review count
});

// GET /api/movies/:id
app.get("/api/movies/:id", (req, res) => {
  const id = Number(req.params.id);
  // Convert route param to number

  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid movie id" });
  }
  // Reject invalid ids like /api/movies/hej

  const movie = getMovieByIdWithReviewCount.get(id);
  // Fetch one movie with review count

  if (!movie) {
    return res.status(404).json({ error: "Movie not found" });
  }
  // Return 404 if no movie exists with that id

  res.json(movie);
});

// POST /api/movies
app.post("/api/movies", (req, res) => {
  const { title, year, genre } = req.body;
  // Extract movie data from request body

  if (
    typeof title !== "string" ||
    title.trim() === "" ||
    typeof genre !== "string" ||
    genre.trim() === "" ||
    typeof year !== "number" ||
    !Number.isInteger(year)
  ) {
    return res.status(400).json({
      error:
        "title and genre must be non-empty strings, year must be an integer",
    });
  }
  // Validate input types and reject empty strings

  const info = insertMovie.run(title.trim(), year, genre.trim());
  // Insert new movie into database

  const newMovie = getMovieByIdWithReviewCount.get(info.lastInsertRowid);
  // Fetch the newly created movie using its new id

  res.status(201).json(newMovie);
  // Return created movie with 201 Created
});

// PUT /api/movies/:id
app.put("/api/movies/:id", (req, res) => {
  const id = Number(req.params.id);
  // Convert route param to number

  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid movie id" });
  }

  const { title, year, genre } = req.body;
  // Extract updated movie data

  if (
    typeof title !== "string" ||
    title.trim() === "" ||
    typeof genre !== "string" ||
    genre.trim() === "" ||
    typeof year !== "number" ||
    !Number.isInteger(year)
  ) {
    return res.status(400).json({
      error:
        "title and genre must be non-empty strings, year must be an integer",
    });
  }
  // Validate input types and reject empty strings

  const existingMovie = getMovieById.get(id);
  // Check if movie exists before update

  if (!existingMovie) {
    return res.status(404).json({ error: "Movie not found" });
  }

  updateMovie.run(title.trim(), year, genre.trim(), id);
  // Update the movie in database

  const updatedMovie = getMovieByIdWithReviewCount.get(id);
  // Fetch updated version

  res.json(updatedMovie);
});

// DELETE /api/movies/:id
app.delete("/api/movies/:id", (req, res) => {
  const id = Number(req.params.id);
  // Convert route param to number

  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid movie id" });
  }

  const existingMovie = getMovieById.get(id);
  // Check if movie exists first

  if (!existingMovie) {
    return res.status(404).json({ error: "Movie not found" });
  }

  deleteReviewsByMovieId.run(id);
  // Delete related reviews first

  deleteMovie.run(id);
  // Delete movie

  res.status(204).send();
  // Success with no response body
});

// ====================
// REVIEW ROUTES
// ====================

// GET /api/movies/:id/reviews
app.get("/api/movies/:id/reviews", (req, res) => {
  const movieId = Number(req.params.id);
  // Convert movie id from route param

  if (Number.isNaN(movieId)) {
    return res.status(400).json({ error: "Invalid movie id" });
  }

  const movie = getMovieById.get(movieId);
  // Check if movie exists

  if (!movie) {
    return res.status(404).json({ error: "Movie not found" });
  }

  const reviews = getReviewsByMovieId.all(movieId);
  // Get all reviews for this movie

  res.json(reviews);
});

app.post("/api/movies/:id/reviews", (req, res) => {
  const movieId = Number(req.params.id);
  // Convert movie id from route param

  if (Number.isNaN(movieId)) {
    return res.status(400).json({ error: "Invalid movie id" });
  }

  const movie = getMovieById.get(movieId);
  // Check if the movie exists

  if (!movie) {
    return res.status(404).json({ error: "Movie not found" });
  }

  const { author, rating, comment } = req.body;
  // Extract review data from request body

  if (
    typeof author !== "string" ||
    author.trim() === "" ||
    typeof rating !== "number" ||
    !Number.isInteger(rating) ||
    (comment !== undefined && comment !== null && typeof comment !== "string")
  ) {
    return res.status(400).json({
      error:
        "author must be a non-empty string, rating must be an integer, comment must be a string if provided",
    });
  }
  // Validate input types and reject empty strings

  if (rating < 1 || rating > 5) {
    return res.status(400).json({
      error: "rating must be between 1 and 5",
    });
  }
  // Assignment requirement: rating must be 1-5

  const info = insertReview.run(
    movieId,
    author.trim(),
    rating,
    typeof comment === "string" ? comment.trim() : null,
  );
  // Insert review and normalize string values

  const newReview = getReviewById.get(info.lastInsertRowid);
  // Fetch the newly created review by its id

  res.status(201).json(newReview);
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
