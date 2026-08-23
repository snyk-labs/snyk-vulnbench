FROM ubuntu:20.04

LABEL name='pygmy'
LABEL version='1.0.0'
LABEL description='Pygmy URL shortener'

RUN apt update && apt install python3-pip -y
RUN ln -s /usr/bin/python3 /usr/bin/python
RUN mkdir /var/log/pygmy

WORKDIR /pygmy
ADD ./requirements.txt /pygmy/requirements.txt
RUN pip3 install -r requirements.txt
# requirements.txt intentionally omits test-only deps (see README); installed
# separately here so the built image can run the test suite out of the box.
RUN pip3 install pytest
ADD . /pygmy

EXPOSE 8000

CMD ["python3", "run.py"]
