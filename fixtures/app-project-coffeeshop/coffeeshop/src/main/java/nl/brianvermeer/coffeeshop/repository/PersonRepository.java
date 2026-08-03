package nl.brianvermeer.coffeeshop.repository;


import nl.brianvermeer.coffeeshop.domain.Person;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface PersonRepository extends JpaRepository<Person, Long> {
    public Person findByUsername(String username);

    public List<Person> findByEmail(String email);


}
