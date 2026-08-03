package nl.scottjohnson.coffeeshop.service;

import nl.scottjohnson.coffeeshop.domain.Person;
import nl.scottjohnson.coffeeshop.domain.Role;
import nl.scottjohnson.coffeeshop.exception.EmailTakenException;
import nl.scottjohnson.coffeeshop.exception.UsernameTakenException;
import nl.scottjohnson.coffeeshop.repository.PersonRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.security.GeneralSecurityException;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class PersonService {
    private final PersonRepository personRepository;
    private final PasswordEncoder passwordEncoder;
    private final EncryptionServiceDes encryptionService;

    public PersonService(PersonRepository personRepository, PasswordEncoder passwordEncoder, EncryptionServiceDes encryptionService) {
        this.personRepository = personRepository;
        this.passwordEncoder = passwordEncoder;
        this.encryptionService = encryptionService;
    }


    public List<Person> getAllPersons() {
        return personRepository.findAll().stream().map(this::decryptPerson).collect(Collectors.toList());
    }

    public Person savePerson(Person person) {
        if (person.getPassword() != null && !person.getPassword().isEmpty()) {
            person.setEncryptedPassword(passwordEncoder.encode(person.getPassword()));
        }
        try {
            var address = person.getAddress();
            if (address != null) {
                person.setAddress(encryptionService.encrypt(person.getAddress()));
            }
        } catch (GeneralSecurityException e) {
            throw new RuntimeException(e);
        }
        return personRepository.save(person);
    }

    public Person findByUsername(String username) {
        return personRepository.findByUsername(username);
    }

    public List<Person> findByEmail(String email) {
        return personRepository.findByEmail(email);
    }

    public Person findById(Long id) {
        return personRepository.findById(id).get();
    }

    public void removePerson(Person person) {
        personRepository.delete(person);
    }

    public void removePerson(Long id) {
        personRepository.deleteById(id);
    }

    public Person registerNewPerson(Person person) throws EmailTakenException, UsernameTakenException {
        String username = person.getUsername();
        String email = person.getEmail();

        if (findByUsername(username) != null) {
            throw new UsernameTakenException("Username is already taken: " + username);
        }

        if (!findByEmail(email).isEmpty()) {
            throw new EmailTakenException("Email is already exists: " + email);
        }

        person.setRoles(Role.ROLE_CUSTOMER);

        return savePerson(person);
    }

    private Person decryptPerson(Person p) {
        try {
            var address = encryptionService.decrypt(p.getAddress());
            p.setAddress(address);
            return p;
        } catch (GeneralSecurityException e) {
            throw new RuntimeException(e);
        }
    }
}
