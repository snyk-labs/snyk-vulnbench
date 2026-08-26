#define _GNU_SOURCE

#include <errno.h>
#include <fcntl.h>
#include <linux/landlock.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/prctl.h>
#include <sys/stat.h>
#include <sys/syscall.h>
#include <unistd.h>

#ifndef LANDLOCK_ACCESS_FS_REFER
#define LANDLOCK_ACCESS_FS_REFER (1ULL << 13)
#endif

#ifndef LANDLOCK_ACCESS_FS_TRUNCATE
#define LANDLOCK_ACCESS_FS_TRUNCATE (1ULL << 14)
#endif

static int create_ruleset(
    const struct landlock_ruleset_attr *attr,
    size_t size,
    __u32 flags) {
  return syscall(SYS_landlock_create_ruleset, attr, size, flags);
}

static int add_rule(
    int ruleset_fd,
    enum landlock_rule_type type,
    const void *attr,
    __u32 flags) {
  return syscall(SYS_landlock_add_rule, ruleset_fd, type, attr, flags);
}

static int restrict_self(int ruleset_fd, __u32 flags) {
  return syscall(SYS_landlock_restrict_self, ruleset_fd, flags);
}

static __u64 read_access(void) {
  return LANDLOCK_ACCESS_FS_EXECUTE |
      LANDLOCK_ACCESS_FS_READ_FILE |
      LANDLOCK_ACCESS_FS_READ_DIR;
}

static __u64 write_access(int abi) {
  __u64 access = read_access() |
      LANDLOCK_ACCESS_FS_WRITE_FILE |
      LANDLOCK_ACCESS_FS_REMOVE_DIR |
      LANDLOCK_ACCESS_FS_REMOVE_FILE |
      LANDLOCK_ACCESS_FS_MAKE_CHAR |
      LANDLOCK_ACCESS_FS_MAKE_DIR |
      LANDLOCK_ACCESS_FS_MAKE_REG |
      LANDLOCK_ACCESS_FS_MAKE_SOCK |
      LANDLOCK_ACCESS_FS_MAKE_FIFO |
      LANDLOCK_ACCESS_FS_MAKE_BLOCK |
      LANDLOCK_ACCESS_FS_MAKE_SYM;
  if (abi >= 2) access |= LANDLOCK_ACCESS_FS_REFER;
  if (abi >= 3) access |= LANDLOCK_ACCESS_FS_TRUNCATE;
  return access;
}

static int add_path(int ruleset_fd, const char *path, __u64 access) {
  int path_fd = open(path, O_PATH | O_CLOEXEC);
  if (path_fd < 0) {
    fprintf(stderr, "landlock: cannot open %s: %s\n", path, strerror(errno));
    return -1;
  }

  struct stat st;
  if (fstat(path_fd, &st) != 0) {
    fprintf(stderr, "landlock: cannot stat %s: %s\n", path, strerror(errno));
    close(path_fd);
    return -1;
  }
  if (!S_ISDIR(st.st_mode)) {
    access &= ~(LANDLOCK_ACCESS_FS_READ_DIR |
        LANDLOCK_ACCESS_FS_REMOVE_DIR |
        LANDLOCK_ACCESS_FS_REMOVE_FILE |
        LANDLOCK_ACCESS_FS_MAKE_CHAR |
        LANDLOCK_ACCESS_FS_MAKE_DIR |
        LANDLOCK_ACCESS_FS_MAKE_REG |
        LANDLOCK_ACCESS_FS_MAKE_SOCK |
        LANDLOCK_ACCESS_FS_MAKE_FIFO |
        LANDLOCK_ACCESS_FS_MAKE_BLOCK |
        LANDLOCK_ACCESS_FS_MAKE_SYM |
        LANDLOCK_ACCESS_FS_REFER);
  }

  const struct landlock_path_beneath_attr rule = {
    .allowed_access = access,
    .parent_fd = path_fd,
  };
  int result = add_rule(
      ruleset_fd,
      LANDLOCK_RULE_PATH_BENEATH,
      &rule,
      0);
  if (result != 0) {
    fprintf(stderr, "landlock: cannot allow %s: %s\n", path, strerror(errno));
  }
  close(path_fd);
  return result;
}

int main(int argc, char **argv) {
  int abi = create_ruleset(NULL, 0, LANDLOCK_CREATE_RULESET_VERSION);
  if (abi < 1) {
    fprintf(stderr, "landlock: unsupported kernel: %s\n", strerror(errno));
    return 125;
  }

  __u64 handled_access = write_access(abi);
  const struct landlock_ruleset_attr ruleset_attr = {
    .handled_access_fs = handled_access,
  };
  int ruleset_fd = create_ruleset(&ruleset_attr, sizeof(ruleset_attr), 0);
  if (ruleset_fd < 0) {
    fprintf(stderr, "landlock: create ruleset failed: %s\n", strerror(errno));
    return 125;
  }

  int index = 1;
  while (index < argc && strcmp(argv[index], "--") != 0) {
    if (index + 1 >= argc) {
      fprintf(stderr, "usage: landlock-run [--ro PATH|--rw PATH]... -- COMMAND...\n");
      return 125;
    }
    bool writable;
    if (strcmp(argv[index], "--ro") == 0) {
      writable = false;
    } else if (strcmp(argv[index], "--rw") == 0) {
      writable = true;
    } else {
      fprintf(stderr, "landlock: unknown option %s\n", argv[index]);
      return 125;
    }
    if (add_path(
          ruleset_fd,
          argv[index + 1],
          writable ? handled_access : read_access()) != 0) {
      return 125;
    }
    index += 2;
  }
  if (index >= argc - 1) {
    fprintf(stderr, "landlock: missing command\n");
    return 125;
  }

  if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0) {
    fprintf(stderr, "landlock: PR_SET_NO_NEW_PRIVS failed: %s\n", strerror(errno));
    return 125;
  }
  if (restrict_self(ruleset_fd, 0) != 0) {
    fprintf(stderr, "landlock: restrict_self failed: %s\n", strerror(errno));
    return 125;
  }
  close(ruleset_fd);

  execvp(argv[index + 1], &argv[index + 1]);
  fprintf(stderr, "landlock: exec failed: %s\n", strerror(errno));
  return 127;
}
