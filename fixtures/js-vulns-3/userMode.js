function fetchUserById(knex, userProvidedValue) {
  return knex.raw(`SELECT * FROM users WHERE id = ${userProvidedValue}`);
}

module.exports = { fetchUserById };
