package io.snyk.devrel.vynil_marketplace.config;

import io.snyk.devrel.vynil_marketplace.domain.Vinyl;
import io.snyk.devrel.vynil_marketplace.repository.VinylRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

import java.util.stream.Stream;

@Component
public class DataLoader implements CommandLineRunner {

    private final VinylRepository vinylRepository;

    public DataLoader(VinylRepository vinylRepository) {
        this.vinylRepository = vinylRepository;
    }

    @Override
    public void run(String... args) {
        if (vinylRepository.count() == 0) {
            loadSampleData();
        }
    }

    private void loadSampleData() {
        var vinyls = Stream.of(
                new Vinyl("The Dark Side of the Moon", "Pink Floyd", "Progressive Rock", 1973, 45.99, "Mint", "/images/albums/dark-side-of-the-moon.jpg"),
                new Vinyl("Abbey Road", "The Beatles", "Rock", 1969, 39.99, "Excellent", "/images/albums/abbey-road.jpg"),
                new Vinyl("Rumours", "Fleetwood Mac", "Rock", 1977, 35.99, "Very Good", "/images/albums/rumours.jpg"),
                new Vinyl("Thriller", "Michael Jackson", "Pop", 1982, 42.99, "Mint", "/images/albums/thriller.jpg"),
                new Vinyl("Back in Black", "AC/DC", "Hard Rock", 1980, 38.99, "Excellent", "/images/albums/back-in-black.jpg"),
                new Vinyl("The Wall", "Pink Floyd", "Progressive Rock", 1979, 55.99, "Mint", "/images/albums/the-wall.jpg"),
                new Vinyl("Led Zeppelin IV", "Led Zeppelin", "Hard Rock", 1971, 44.99, "Very Good", "/images/albums/led-zeppelin-iv.jpg"),
                new Vinyl("Hotel California", "Eagles", "Rock", 1976, 36.99, "Excellent", "/images/albums/hotel-california.jpg"),
                new Vinyl("Born to Run", "Bruce Springsteen", "Rock", 1975, 32.99, "Good", "/images/albums/born-to-run.jpg"),
                new Vinyl("Purple Rain", "Prince", "Pop/Rock", 1984, 41.99, "Mint", "/images/albums/purple-rain.jpg"),
                new Vinyl("Nevermind", "Nirvana", "Grunge", 1991, 34.99, "Excellent", "/images/albums/nevermind.jpg"),
                new Vinyl("OK Computer", "Radiohead", "Alternative Rock", 1997, 37.99, "Mint", "/images/albums/ok-computer.jpg"),
                new Vinyl("Kind of Blue", "Miles Davis", "Jazz", 1959, 49.99, "Very Good", "/images/albums/kind-of-blue.jpg"),
                new Vinyl("A Love Supreme", "John Coltrane", "Jazz", 1965, 47.99, "Excellent", "/images/albums/a-love-supreme.jpg"),
                new Vinyl("What's Going On", "Marvin Gaye", "Soul", 1971, 43.99, "Mint", "/images/albums/whats-going-on.jpg"),
                new Vinyl("Songs in the Key of Life", "Stevie Wonder", "Soul/R&B", 1976, 52.99, "Excellent", "/images/albums/songs-in-the-key-of-life.jpg"),
                new Vinyl("The Rise and Fall of Ziggy Stardust", "David Bowie", "Glam Rock", 1972, 40.99, "Very Good", "/images/albums/ziggy-stardust.jpg"),
                new Vinyl("London Calling", "The Clash", "Punk Rock", 1979, 38.99, "Excellent", "/images/albums/london-calling.jpg"),
                new Vinyl("Blue", "Joni Mitchell", "Folk", 1971, 35.99, "Mint", "/images/albums/blue.jpg"),
                new Vinyl("Pet Sounds", "The Beach Boys", "Rock", 1966, 46.99, "Very Good", "/images/albums/pet-sounds.jpg"),
                new Vinyl("Revolver", "The Beatles", "Rock", 1966, 44.99, "Excellent", "/images/albums/revolver.jpg"),
                new Vinyl("The Joshua Tree", "U2", "Rock", 1987, 39.99, "Mint", "/images/albums/the-joshua-tree.png"),
                new Vinyl("Appetite for Destruction", "Guns N' Roses", "Hard Rock", 1987, 41.99, "Very Good", "/images/albums/appetite-for-destruction.jpg"),
                // Stored XSS (lesson): <script> doesn't run when injected via innerHTML; img onerror does
                new Vinyl("Blood on the Tracks", "Bob Dylan <img src=x onerror=\"alert('XSS')\">", "Folk Rock", 1975, 37.99, "Excellent", "/images/albums/blood-on-the-tracks.jpg"),
                new Vinyl("In the Court of the Crimson King", "King Crimson", "Progressive Rock", 1969, 48.99, "Very Good", "/images/albums/in-the-court-of-the-crimson-king.jpg"),
                new Vinyl("Graceland", "Paul Simon", "Rock", 1986, 36.99, "Excellent", "/images/albums/graceland.jpg"),
                new Vinyl("The Queen Is Dead", "The Smiths", "Alternative Rock", 1986, 39.99, "Mint", "/images/albums/the-queen-is-dead.png"),
                new Vinyl("Doolittle", "Pixies", "Alternative Rock", 1989, 34.99, "Very Good", "/images/albums/doolittle.jpg"),
                new Vinyl("Sticky Fingers", "The Rolling Stones", "Rock", 1971, 46.99, "Excellent", "/images/albums/sticky-fingers.png"),
                new Vinyl("Illmatic", "Nas", "Hip Hop", 1994, 42.99, "Mint", "/images/albums/illmatic.jpg"),
                new Vinyl("Ten", "Pearl Jam", "Grunge", 1991, 38.99, "Very Good", "/images/albums/ten.jpg"),
                new Vinyl("Slowhand", "Eric Clapton", "Rock", 1977, 36.99, "Excellent", "/images/albums/slowhand.jpg"),
                new Vinyl("The Colour and the Shape", "Foo Fighters", "Rock", 1997, 35.99, "Mint", "/images/albums/the-colour-and-the-shape.jpg"),
                new Vinyl("The Miseducation of Lauryn Hill", "Lauryn Hill", "Hip Hop", 1998, 44.99, "Mint", "/images/albums/the-miseducation-of-lauryn-hill.png"),
                new Vinyl("Ready to Die", "The Notorious B.I.G.", "Hip Hop", 1994, 43.99, "Excellent", "/images/albums/ready-to-die.jpg"),
                new Vinyl("The Chronic", "Dr. Dre", "Hip Hop", 1992, 41.99, "Very Good", "/images/albums/the-chronic.jpg")
        ).toList();
        
        vinylRepository.saveAll(vinyls);
    }
}
