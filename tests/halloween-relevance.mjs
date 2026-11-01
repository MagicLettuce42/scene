import assert from "node:assert/strict";
import { halloweenDiscoveryTopics, halloweenSelections, isHalloweenRelevant } from "../lib/halloween.ts";

const film = (name, genres, summary = "", tmdbId = 900000) => ({
  name, genres, summary, tmdbId, kind: "movie",
});

for (const title of [
  film("Shrek Forever After", ["Family", "Adventure", "Fantasy"], "Witches rule an alternate kingdom where an ogre tries to reverse a magical deal."),
  film("The Chronicles of Narnia: The Lion, the Witch and the Wardrobe", ["Family", "Adventure", "Fantasy"], "Children enter a magical kingdom and help a lion challenge a witch."),
  film("Harry Potter", ["Family", "Adventure", "Fantasy"], "A boy attends a school for witches and wizards."),
  film("Monsters, Inc.", ["Family", "Animation", "Comedy"], "Monsters work in a factory collecting children's screams."),
  film("Ghost", ["Romance", "Drama", "Fantasy"], "A ghost tries to protect his partner."),
  film("Unknown fantasy", ["Family", "Fantasy"]),
]) assert.equal(isHalloweenRelevant(title), false, title.name + " must not qualify through broad fantasy metadata");

for (const title of [
  film("A new horror film", ["Horror", "Thriller"]),
  film("Scared Shrekless", ["Family", "Animation"], "Shrek and friends tell scary stories on Halloween."),
  film("A Halloween special", ["Comedy"]),
  film("Hotel Transylvania 2", ["Family", "Animation"], "A vampire family welcomes a new arrival."),
  film("Casper", ["Family", "Fantasy"], "A friendly ghost befriends a girl."),
  film("A spooky family adventure", ["Family", "Fantasy"], "Children investigate a haunted house."),
]) assert.equal(isHalloweenRelevant(title), true, title.name + " retains specific Halloween relevance");

for (const pick of halloweenSelections("all")) {
  assert.equal(isHalloweenRelevant({ ...pick, genres: [], summary: "" }), true, "reviewed pick remains: " + pick.name);
}
assert.equal(isHalloweenRelevant({ ...film("Unrelated series", ["Fantasy"], "", 14836), kind: "series" }), false,
  "a movie ID must not approve a different TV record");
for (const mood of ["all", "family", "horror", "supernatural"]) {
  const topics = halloweenDiscoveryTopics(mood);
  assert.ok(topics.length > 0);
  assert.ok(!topics.includes("witch") && !topics.includes("supernatural"), "discovery avoids broad fantasy keywords");
}
console.log("PASS: Shrek/Narnia and general fantasy exclusions; horror, Halloween specials, spooky family films and reviewed picks retained.");
