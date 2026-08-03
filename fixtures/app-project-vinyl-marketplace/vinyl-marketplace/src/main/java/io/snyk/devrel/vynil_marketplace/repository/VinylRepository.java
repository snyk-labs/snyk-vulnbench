package io.snyk.devrel.vynil_marketplace.repository;

import io.snyk.devrel.vynil_marketplace.domain.Vinyl;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface VinylRepository extends JpaRepository<Vinyl, Long> {

    List<Vinyl> findByTitleContainingIgnoreCase(String title);

    List<Vinyl> findByArtistContainingIgnoreCase(String artist);

    List<Vinyl> findByGenreContainingIgnoreCase(String genre);

    List<Vinyl> findByGenre(String genre);

    List<Vinyl> findAllByOrderByArtistAsc();
}
