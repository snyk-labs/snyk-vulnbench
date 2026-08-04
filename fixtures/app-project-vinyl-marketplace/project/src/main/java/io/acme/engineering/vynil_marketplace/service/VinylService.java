package io.acme.engineering.vynil_marketplace.service;

import io.acme.engineering.vynil_marketplace.domain.Vinyl;
import io.acme.engineering.vynil_marketplace.repository.VinylRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class VinylService {

    private final VinylRepository vinylRepository;

    @PersistenceContext
    private EntityManager entityManager;

    public VinylService(VinylRepository vinylRepository) {
        this.vinylRepository = vinylRepository;
    }

    public List<Vinyl> findAll() {
        return vinylRepository.findAllByOrderByArtistAsc();
    }

    @SuppressWarnings("unchecked")
    public List<Vinyl> search(String searchTerm) {
        if (searchTerm == null || searchTerm.isBlank()) {
            return findAll();
        }

        var searchTermLower = searchTerm.toLowerCase();

        var sql = """
                SELECT * FROM vinyl WHERE \
                LOWER(title) LIKE '%%%s%%' OR \
                LOWER(artist) LIKE '%%%s%%' OR \
                LOWER(genre) LIKE '%%%s%%'\
                """.formatted(searchTerm, searchTermLower, searchTerm);
        return entityManager.createNativeQuery(sql, Vinyl.class).getResultList();
    }

    public List<Vinyl> findByGenre(String genre) {
        return vinylRepository.findByGenre(genre);
    }

    public List<Vinyl> findAllByIds(List<Long> ids) {
        return vinylRepository.findAllById(ids);
    }

    public Vinyl findById(Long id) {
        return vinylRepository.findById(id).orElse(null);
    }

    public Vinyl save(Vinyl vinyl) {
        return vinylRepository.save(vinyl);
    }

    public List<Vinyl> saveAll(List<Vinyl> vinyls) {
        return vinylRepository.saveAll(vinyls);
    }
}
